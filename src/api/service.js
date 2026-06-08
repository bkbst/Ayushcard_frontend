import axios from 'axios';
import { withOcrRetry } from '../utils/aadhaarOcrApi.js';

// ─── AXIOS INSTANCE SETUP ──────────────────────────────────────────────────

const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || '',
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000,
});

// ─── PUBLIC AXIOS INSTANCE (no auth) ───────────────────────────────────────
// Used for unauthenticated endpoints such as the home-page card application
const publicApi = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || '',
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
});

// Duplicate-check GETs: in dev, always use same-origin `/api` so Vite’s proxy runs.
// Direct calls to VITE_API_BASE_URL from localhost:5173 are blocked when the API
// only allows Origin http://localhost:3000 (CORS).
const cardCheckApi = axios.create({
    baseURL: import.meta.env.DEV ? '' : import.meta.env.VITE_API_BASE_URL || '',
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
});

/** OCR multipart uploads — same-origin proxy in dev (avoids CORS / Network Error). */
const ocrApi = axios.create({
    baseURL: import.meta.env.DEV ? '' : import.meta.env.VITE_API_BASE_URL || '',
    timeout: 120000,
});

// ─── IN-FLIGHT GET DEDUPE (prevents StrictMode double-fetch in dev) ─────────

const inFlightGet = new Map();
const recentGet = new Map();
const RECENT_GET_TTL_MS = 500;

function sortForStableStringify(value) {
    if (value == null) return value;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(sortForStableStringify);
    if (typeof value === 'object') {
        const out = {};
        for (const key of Object.keys(value).sort()) {
            const v = value[key];
            if (v === undefined) continue;
            out[key] = sortForStableStringify(v);
        }
        return out;
    }
    return value;
}

function stableStringify(value) {
    try {
        return JSON.stringify(sortForStableStringify(value));
    } catch {
        return String(value);
    }
}

async function dedupedGetJson(instanceName, instance, url, config = {}) {
    const paramsKey = stableStringify(config?.params || {});
    const key = `${instanceName}|GET|${url}|${paramsKey}`;

    if (config?.dedupe === false) {
        const response = await instance.get(url, config);
        return response.data;
    }

    const cached = recentGet.get(key);
    if (cached && Date.now() - cached.ts < RECENT_GET_TTL_MS) {
        return cached.data;
    }

    if (inFlightGet.has(key)) return inFlightGet.get(key);

    const promise = instance
        .get(url, config)
        .then((response) => {
            const data = response.data;
            recentGet.set(key, { ts: Date.now(), data });
            return data;
        })
        .finally(() => {
            inFlightGet.delete(key);
        });

    inFlightGet.set(key, promise);
    return promise;
}

/** Normalize GET /api/cards/check/* envelope: { data: { exists, cardId } } or flat { exists } */
function normalizeCardCheckResponse(body) {
    if (!body || typeof body !== 'object') return null;
    const inner =
        body.data != null && typeof body.data === 'object' && !Array.isArray(body.data)
            ? body.data
            : body;
    const raw = inner.exists ?? inner.exist;
    if (raw === true || raw === 'true' || raw === 1 || raw === '1') {
        return { exists: true, cardId: inner.cardId ?? inner.card_id ?? null };
    }
    if (raw === false || raw === 'false' || raw === 0 || raw === '0') {
        return { exists: false, cardId: inner.cardId ?? inner.card_id ?? null };
    }
    return null;
}

// ─── STORAGE HELPERS ───────────────────────────────────────────────────────

const storage = {
    // Read from both storages (login saves to either based on "keep me logged in")
    get: (key) => localStorage.getItem(key) || sessionStorage.getItem(key) || null,

    // Write to whichever storage was used during login
    set: (key, value) => {
        if (localStorage.getItem('token') !== null || localStorage.getItem('refreshToken') !== null) {
            localStorage.setItem(key, value);
        } else {
            sessionStorage.setItem(key, value);
        }
    },

    clear: () => {
        ['token', 'refreshToken', 'user'].forEach((key) => {
            localStorage.removeItem(key);
            sessionStorage.removeItem(key);
        });
    },
};

const getToken = () => storage.get('token');
const getRefreshToken = () => storage.get('refreshToken');

async function postAadhaarOcrMultipart(path, imageFile, defaultName) {
    const token = getToken();
    if (!token) {
        const err = new Error('Authentication required');
        err.response = {
            status: 401,
            data: { success: false, message: 'Authentication required' },
        };
        throw err;
    }

    const file =
        imageFile instanceof File
            ? imageFile
            : new File([imageFile], defaultName, {
                  type: imageFile?.type || 'image/jpeg',
              });

    if (!file.size) {
        const err = new Error('Image is required. Use form field name: image');
        err.response = {
            status: 400,
            data: { success: false, message: err.message },
        };
        throw err;
    }

    const formData = new FormData();
    formData.append('image', file, file.name || defaultName);

    return withOcrRetry(async () => {
        const response = await ocrApi.post(path, formData);
        return throwIfOcrResponseFailed(response.data);
    });
}

function throwIfOcrResponseFailed(data) {
    if (data && data.success === false) {
        const err = new Error(data.message || 'OCR request failed');
        err.response = {
            status: /auth/i.test(String(data.message || '')) ? 401 : 400,
            data,
        };
        throw err;
    }
    return data;
}

// ─── REFRESH TOKEN LOGIC ───────────────────────────────────────────────────

let isRefreshing = false;                // prevent multiple simultaneous refresh calls
let refreshQueue = [];                   // queue of failed requests awaiting new token
let refreshEndpointMissing = false;      // set to true if /refresh-token endpoint is 404

const processQueue = (error, newToken = null) => {
    refreshQueue.forEach((prom) => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(newToken);
        }
    });
    refreshQueue = [];
};

const doRefresh = async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) throw new Error('No refresh token available');

    try {
        // Use publicApi to call the refresh endpoint
        const response = await publicApi.post('/api/auth/refresh-token', { refreshToken });

        // User's response structure: { success, message, data: { accessToken } }
        // We also check for refreshToken in case the backend supports rotation
        const newAccessToken = response.data?.data?.accessToken || response.data?.accessToken;
        const newRefreshToken = response.data?.data?.refreshToken || response.data?.refreshToken;

        if (!newAccessToken) {
            throw new Error('Refresh response missing accessToken');
        }

        // Save new tokens
        storage.set('token', newAccessToken);
        if (newRefreshToken) {
            storage.set('refreshToken', newRefreshToken);
        }

        return newAccessToken;
    } catch (error) {
        console.error('[service] Refresh token failed:', error.response?.data || error.message);
        throw error;
    }
};

// Default `Content-Type: application/json` prevents multipart file upload from reaching the API.
function stripJsonContentTypeForFormData(config) {
    if (config.data instanceof FormData) {
        const headers = config.headers;
        if (headers && typeof headers.setContentType === 'function') {
            headers.setContentType(false);
        } else if (headers?.delete) {
            headers.delete('Content-Type');
        } else if (headers) {
            delete headers['Content-Type'];
        }
    }
    return config;
}

// ─── REQUEST INTERCEPTOR ───────────────────────────────────────────────────

api.interceptors.request.use(
    (config) => {
        const token = getToken();
        if (token) config.headers.Authorization = `Bearer ${token}`;
        return stripJsonContentTypeForFormData(config);
    },
    (error) => Promise.reject(error)
);

publicApi.interceptors.request.use(
    (config) => stripJsonContentTypeForFormData(config),
    (error) => Promise.reject(error)
);

ocrApi.interceptors.request.use(
    (config) => {
        const token = getToken();
        if (token) config.headers.Authorization = `Bearer ${token}`;
        return stripJsonContentTypeForFormData(config);
    },
    (error) => Promise.reject(error)
);

// ─── RESPONSE INTERCEPTOR ─────────────────────────────────────────────────

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        const status = error.response?.status;

        // Only handle 401 and avoid retrying refresh calls themselves
        if (
            status === 401 &&
            !originalRequest._retry &&
            !refreshEndpointMissing &&
            !originalRequest.url?.includes('/api/auth/refresh-token') &&
            !originalRequest.url?.includes('/api/auth/login')
        ) {
            // If no tokens at all → silent reject (user not logged in)
            if (!getToken() && !getRefreshToken()) {
                return Promise.reject(error);
            }

            if (isRefreshing) {
                // Another request is already refreshing — queue this one
                return new Promise((resolve, reject) => {
                    refreshQueue.push({ resolve, reject });
                })
                    .then((newToken) => {
                        originalRequest.headers.Authorization = `Bearer ${newToken}`;
                        return api(originalRequest);
                    })
                    .catch((err) => Promise.reject(err));
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                const newToken = await doRefresh();
                processQueue(null, newToken);

                // Retry original failed request with new token
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
                return api(originalRequest);
            } catch (refreshError) {
                // If the refresh endpoint itself is not found (404), disable future refresh attempts
                if (refreshError?.response?.status === 404) {
                    refreshEndpointMissing = true;
                    console.warn('[service] /refresh-token endpoint not found — refresh disabled.');
                }
                // Refresh failed → tokens are unusable → fire auth:logout event
                processQueue(refreshError, null);
                storage.clear();
                window.dispatchEvent(new CustomEvent('auth:logout'));
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }

        return Promise.reject(error);
    }
);

// ─── API SERVICES ──────────────────────────────────────────────────────────

const apiService = {

    // ─── AUTH ─────────────────────────────────────────────────────────────

    // POST /api/auth/login
    login: async (email, password) => {
        const response = await api.post('/api/auth/login', { email, password });
        return response.data;
    },

    // POST /api/auth/refresh-token  (called automatically by interceptor, exposed if needed)
    refreshToken: async () => {
        const newToken = await doRefresh();
        return newToken;
    },

    // ─── USER ─────────────────────────────────────────────────────────────

    // GET /api/users/profile
    getProfile: async () => {
        const data = await dedupedGetJson('api', api, '/api/users/profile');
        if (import.meta.env.DEV) {
            console.log('[getProfile] raw response:', data);
        }
        return data;
    },

    // GET /api/users
    getEmployees: async (params = {}) => {
        return dedupedGetJson('api', api, '/api/users', { params });
    },

    // POST /api/users
    createEmployee: async (employeeData) => {
        const response = await api.post('/api/users', employeeData);
        return response.data;
    },

    // PUT /api/users/employee/:userId
    updateEmployee: async (userId, employeeData) => {
        const response = await api.put(`/api/users/employee/${userId}`, employeeData);
        return response.data;
    },

    // GET /api/users/:id
    getEmployeeById: async (id) => {
        return dedupedGetJson('api', api, `/api/users/${id}`);
    },

    // DELETE /api/users/:id
    deleteEmployee: async (id) => {
        const response = await api.delete(`/api/users/${id}`);
        return response.data;
    },

    // ─── HEALTH CARDS ─────────────────────────────────────────────────────

    // POST /api/cards
    createHealthCard: async (cardData, file = null) => {
        // Ensure a unique transactionId in the payment object if payment method is provided
        if (cardData.paymentMethod && !cardData.payment) {
            cardData.payment = {
                transactionId: `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`,
                method: cardData.paymentMethod,
                totalAmount: cardData.totalAmount || 0,
                date: new Date().toISOString()
            };
        } else if (cardData.payment && !cardData.payment.transactionId) {
            cardData.payment.transactionId = `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
        }

        if (file) {
            const formData = new FormData();
            formData.append('data', JSON.stringify(cardData));
            formData.append('document', file);

            const response = await api.post('/api/cards', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            return response.data;
        }

        const response = await api.post('/api/cards', cardData, {
            headers: { 'Content-Type': 'application/json' },
        });
        return response.data;
    },

    // GET /api/cards
    getHealthCards: async (params = {}) => {
        return dedupedGetJson('api', api, '/api/cards', { params });
    },

    /** Pending / unverified applications only (Ayush Card Applications list) */
    getApplicationHealthCards: async (params = {}) => {
        return dedupedGetJson('api', api, '/api/cards', {
            params: { ...params, status: 'pending' },
        });
    },

    // GET /api/cards/employee/:employeeId?page=&limit=&search=
    getHealthCardsByEmployee: async (employeeId, params = {}) => {
        return dedupedGetJson(
            'api',
            api,
            `/api/cards/employee/${encodeURIComponent(employeeId)}`,
            { params },
        );
    },

    // GET /api/cards/:id
    getHealthCardById: async (id) => {
        return dedupedGetJson('api', api, `/api/cards/${id}`);
    },

    // GET /api/cards/card/:cardNo  (public QR verify lookup by card number)
    getHealthCardByCardNo: async (cardNo) => {
        return dedupedGetJson('api', api, `/api/cards/card/${encodeURIComponent(cardNo)}`);
    },

    // PUT /api/cards/:id
    updateHealthCard: async (id, cardData, file = null) => {
        if (file) {
            const formData = new FormData();
            formData.append('data', JSON.stringify(cardData));
            formData.append('document', file);

            const response = await api.put(`/api/cards/${id}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            return response.data;
        }

        const response = await api.put(`/api/cards/${id}`, cardData, {
            headers: { 'Content-Type': 'application/json' },
        });
        return response.data;
    },

    // PATCH /api/cards/:id/status  (status-only update)
    updateHealthCardStatus: async (id, status) => {
        const response = await api.patch(`/api/cards/${id}/status`, { status });
        return response.data;
    },

    // DELETE /api/cards/:id
    deleteHealthCard: async (id) => {
        const response = await api.delete(`/api/cards/${id}`);
        return response.data;
    },

    // GET /api/cards/verified/not-printed
    getVerifiedNotPrintedCards: async (params = {}) => {
        return dedupedGetJson('api', api, '/api/cards/verified/not-printed', { params });
    },

    // PUT /api/cards/print-status
    updatePrintStatus: async (cardIds, isPrint) => {
        const response = await api.put('/api/cards/print-status', { cardIds, isPrint });
        return response.data;
    },

    // GET /api/cards/printed
    getPrintedCards: async (params = {}) => {
        return dedupedGetJson('api', api, '/api/cards/printed', {
            params: { ...params, allowDiskUse: true },
        });
    },

    // PATCH /api/cards/:id/distribute  (recipient photo as base64 in JSON body)
    distributeCard: async (id, imageBase64) => {
        const response = await api.patch(`/api/cards/${id}/distribute`, { image: imageBase64 });
        return response.data;
    },

    // ─── DUPLICATE RECEIPTS ───────────────────────────────────────────────

    // GET /api/duplicate-receipts
    getDuplicateReceipts: async (params = {}) => {
        return dedupedGetJson('api', api, '/api/duplicate-receipts', { params });
    },

    // POST /api/duplicate-receipts  (payment proof as base64 in JSON body)
    createDuplicateReceipt: async (payload) => {
        const response = await api.post('/api/duplicate-receipts', payload);
        return response.data;
    },

    // DELETE /api/duplicate-receipts/:receiptNo
    deleteDuplicateReceipt: async (receiptNo) => {
        const response = await api.delete(`/api/duplicate-receipts/${encodeURIComponent(receiptNo)}`);
        return response.data;
    },

    // ─── CARD MEMBERS ─────────────────────────────────────────────────────

    // GET /api/card-members/card/:cardId
    getCardMembers: async (cardId) => {
        return dedupedGetJson('api', api, `/api/card-members/card/${cardId}`);
    },

    // ─── ORGANIZATIONS ────────────────────────────────────────────────────

    // POST /api/organizations
    createOrganization: async (orgData) => {
        const response = await api.post('/api/organizations', orgData);
        return response.data;
    },

    // GET /api/organizations
    getOrganizations: async (params = {}) => {
        return dedupedGetJson('api', api, '/api/organizations', { params });
    },

    // GET /api/organizations/:id
    getOrganizationById: async (id) => {
        return dedupedGetJson('api', api, `/api/organizations/${id}`);
    },

    // PUT /api/organizations/:id
    updateOrganization: async (id, orgData) => {
        const response = await api.put(`/api/organizations/${id}`, orgData);
        return response.data;
    },

    // DELETE /api/organizations/:id
    deleteOrganization: async (id) => {
        const response = await api.delete(`/api/organizations/${id}`);
        return response.data;
    },

    // GET /api/organizations/dashboard/stats
    getDashboardStats: async () => {
        return dedupedGetJson('api', api, '/api/organizations/dashboard/stats');
    },

    // ─── DOCTORS ──────────────────────────────────────────────────────────

    // POST /api/doctors
    // Body: { name, specialty, timeFrom, timeTo, location, organizationId, days[] }
    createDoctor: async (doctorData) => {
        const response = await api.post('/api/doctors/', doctorData);
        return response.data;
    },

    // GET /api/doctors/organization/:organizationId
    getDoctors: async (organizationId) => {
        const url = organizationId
            ? `/api/doctors/organization/${organizationId}`
            : '/api/doctors';
        return dedupedGetJson('api', api, url);
    },

    // PUT /api/doctors/:id
    updateDoctor: async (id, doctorData) => {
        const response = await api.put(`/api/doctors/${id}`, doctorData);
        return response.data;
    },

    // DELETE /api/doctors/:id
    deleteDoctor: async (id) => {
        const response = await api.delete(`/api/doctors/${id}`);
        return response.data;
    },

    // ─── SALARIES ─────────────────────────────────────────────────────────

    // POST /api/salaries
    createSalary: async (salaryData) => {
        const response = await api.post('/api/salaries', salaryData);
        return response.data;
    },

    // ─── PUBLIC CARD APPLICATION (home page) ──────────────────────────────

    // POST /api/cards/card-users  (no auth required — public endpoint)
    submitCardApplication: async (payload) => {
        const response = await publicApi.post('/api/cards/card-users', payload);
        return response.data;
    },

    /** GET /api/cards/check/phone?contact= — returns { exists, cardId } | null */
    checkCardPhoneExists: async (contact) => {
        const data = await dedupedGetJson('cardCheckApi', cardCheckApi, '/api/cards/check/phone', {
            params: { contact: String(contact).replace(/\D/g, '') },
        });
        return normalizeCardCheckResponse(data);
    },

    /** GET /api/cards/check/aadhaar?aadhaarNumber= */
    checkCardAadhaarExists: async (aadhaarNumber) => {
        const data = await dedupedGetJson('cardCheckApi', cardCheckApi, '/api/cards/check/aadhaar', {
            params: { aadhaarNumber: String(aadhaarNumber).replace(/\D/g, '') },
        });
        return normalizeCardCheckResponse(data);
    },

    /** GET /api/cards/check/name?firstName=&middleName=&lastName= */
    checkCardNameExists: async ({ firstName = '', middleName = '', lastName = '' } = {}) => {
        const data = await dedupedGetJson('cardCheckApi', cardCheckApi, '/api/cards/check/name', {
            params: {
                firstName: firstName || '',
                middleName: middleName || '',
                lastName: lastName || '',
            },
        });
        return normalizeCardCheckResponse(data);
    },

    // ─── PUBLIC DONATION (home page) ──────────────────────────────

    // POST /api/donations (no auth required — public endpoint)
    submitDonation: async (payload) => {
        const response = await publicApi.post('/api/donations', payload);
        return response.data;
    },

    // GET /api/donations (authenticated)
    getDonations: async (params = {}) => {
        return dedupedGetJson('api', api, '/api/donations', { params });
    },

    // ─── REPORTS ──────────────────────────────────────────────────────────

    // GET /api/reports/summary
    getReportsSummary: async () => {
        return dedupedGetJson('api', api, '/api/reports/summary');
    },

    // GET /api/reports/monthly-trend
    getReportsMonthlyTrend: async () => {
        return dedupedGetJson('api', api, '/api/reports/monthly-trend');
    },

    // GET /api/reports/cards/status
    getReportsCardsStatus: async () => {
        return dedupedGetJson('api', api, '/api/reports/cards/status');
    },

    // GET /api/reports/cards/age-groups
    getReportsCardsAgeGroups: async () => {
        return dedupedGetJson('api', api, '/api/reports/cards/age-groups');
    },

    // GET /api/reports/cards/location
    getReportsCardsLocation: async () => {
        return dedupedGetJson('api', api, '/api/reports/cards/location');
    },

    // GET /api/reports/employee-performance?date=YYYY-MM-DD
    getReportsEmployeePerformance: async (params = {}) => {
        return dedupedGetJson('api', api, '/api/reports/employee-performance', { params });
    },

    // GET /api/reports/daily
    getReportsDaily: async (params = {}) => {
        return dedupedGetJson('api', api, '/api/reports/daily', { params });
    },

    // GET /api/reports/monthly
    getReportsMonthly: async (params = {}) => {
        return dedupedGetJson('api', api, '/api/reports/monthly', { params });
    },

    // GET /api/reports/yearly
    getReportsYearly: async (params = {}) => {
        return dedupedGetJson('api', api, '/api/reports/yearly', { params });
    },

    // ─── CAMPS ────────────────────────────────────────────────────────────

    // POST /api/camps
    createCamp: async (campData) => {
        const response = await api.post('/api/camps', campData);
        return response.data;
    },

    // GET /api/camps
    getCamps: async (params = {}) => {
        return dedupedGetJson('api', api, '/api/camps', { params });
    },

    // GET /api/camps/:id
    getCampById: async (id) => {
        return dedupedGetJson('api', api, `/api/camps/${id}`);
    },

    // PUT /api/camps/:id
    updateCamp: async (id, campData) => {
        const response = await api.put(`/api/camps/${id}`, campData);
        return response.data;
    },

    // DELETE /api/camps/:id
    deleteCamp: async (id) => {
        const response = await api.delete(`/api/camps/${id}`);
        return response.data;
    },

    // ─── UTILITY ──────────────────────────────────────────────────────────


    // ─── PAYMENTS ──────────────────────────────────────────────────────────────

    // POST /api/payments/create-order
    // Body: { amount, customerName, customerEmail, customerPhone }
    createPaymentOrder: async (payload) => {
        const response = await api.post('/api/payments/create-order', payload);
        return response.data;
    },

    // POST /api/payments/create-order (public)
    createPublicPaymentOrder: async (payload) => {
        const response = await publicApi.post('/api/payments/create-order', payload);
        return response.data;
    },

    // GET /api/payments/verify/:orderId
    // Body (as params): { amount, customerName, customerEmail, customerPhone }
    verifyPayment: async (orderId, data = {}) => {
        return dedupedGetJson('api', api, `/api/payments/verify/${orderId}`, { params: data });
    },

    // GET /api/payments/verify/:orderId (public)
    verifyPublicPayment: async (orderId, data = {}) => {
        return dedupedGetJson('publicApi', publicApi, `/api/payments/verify/${orderId}`, { params: data });
    },

    // POST /api/payments/webhook
    webhookPayment: async (payload) => {
        const response = await api.post('/api/payments/webhook', payload);
        return response.data;
    },

    // ─── ATTENDANCE ───────────────────────────────────────────────────────────

    // POST /api/attendance  { campId, currentLat, currentLong }
    markAttendance: async (payload) => {
        const response = await api.post('/api/attendance', payload);
        return response.data;
    },

    // POST /api/attendance/checkout  { campId, currentLat, currentLong }
    checkoutAttendance: async (payload) => {
        const response = await api.post('/api/attendance/checkout', payload);
        return response.data;
    },

    // GET /api/attendance  (admin — all employees, filterable by date)
    getAttendance: async (params = {}) => {
        return dedupedGetJson('api', api, '/api/attendance', { params });
    },

    // GET /api/attendance/users/:id?date=&fromDate=&toDate=
    getUserAttendance: async (userId, params = {}) => {
        return dedupedGetJson('api', api, `/api/attendance/users/${userId}`, { params });
    },

    // ─── AADHAAR OCR (multipart field `image`, JPEG File, auth required) ─────

    ocrAadhaarFront: async (imageFile) => {
        return postAadhaarOcrMultipart('/api/ocr/aadhaar/front', imageFile, 'aadhaar_front.jpg');
    },

    ocrAadhaarBack: async (imageFile) => {
        return postAadhaarOcrMultipart('/api/ocr/aadhaar/back', imageFile, 'aadhaar_back.jpg');
    },

    // ─── FILE UPLOAD ──────────────────────────────────────────────────────────

    /**
     * Upload a single file using multipart/form-data
     */
    uploadFile: async (file, folder = 'general') => {
        const formData = new FormData();
        formData.append('file', file);
        
        // Use publicApi to allow unauthenticated/public card creations to also upload files
        const response = await publicApi.post(`/api/upload/single?folder=${folder}`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    },

    /**
     * Convert base64 Data URI to File and upload it
     */
    uploadBase64: async (base64Data, filename = 'image.jpg', folder = 'general') => {
        if (!base64Data) return null;
        if (!base64Data.startsWith('data:')) {
            // Already a URL or absolute path, no need to upload
            return { data: { path: base64Data } };
        }
        
        try {
            const arr = base64Data.split(',');
            const mime = arr[0].match(/:(.*?);/)[1];
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }
            const file = new File([u8arr], filename, { type: mime });
            return await apiService.uploadFile(file, folder);
        } catch (error) {
            console.error('Error parsing base64 string:', error);
            throw new Error('Failed to convert base64 image');
        }
    },

    logout: () => {
        storage.clear();
    },
};

export default apiService;

