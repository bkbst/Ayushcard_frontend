import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import { ApplyAyushCardModalProvider } from "./context/ApplyAyushCardModalContext";
import Navbar from "./components/layout/Navbar";
import Footer from "./components/layout/Footer";
import ScrollToTop from "./components/layout/ScrollToTop";

// Auth
import Login from "./pages/auth/Login";

// Public
import CardVerify from "./pages/public/CardVerify";

// Home sections
import HeroSection from "./components/sections/home/HeroSection";
import About from "./components/sections/home/About";
import ServicesSection from "./components/sections/home/ServicesSection";
import DonateSection from "./components/sections/home/DonateSection";
import TestimonialsSection from "./components/sections/home/TestimonialsSection";
import CertificationsSection from "./components/sections/home/CertificationsSection";
import Faqs from "./components/sections/home/Faqs";

// About page
import AboutHero from "./components/pages/about-dedi/AboutHero";
import TeamSection from "./components/pages/about-dedi/TeamSection";
import FocusAreas from "./components/pages/about-dedi/FocusAreas";
import ImageGallery from "./components/pages/about-dedi/ImageGallery";
import Members from "./components/pages/about-dedi/Members";
import AssociatedHospitalsHero from "./components/pages/about-dedi/associatedhospital/AssociatedHospitalsHero";
import ContactUs from "./components/pages/about-dedi/contact/ContactUs";
import HospitalHero from "./components/pages/about-dedi/hospitaldedipages/HospitalHero";
import HospitalAbout from "./components/pages/about-dedi/hospitaldedipages/HospitalAbout";
import MedicalServices from "./components/pages/about-dedi/hospitaldedipages/MedicalServices";
import HospitalFacilities from "./components/pages/about-dedi/hospitaldedipages/HospitalFacilities";
import HealthCardBanner from "./components/pages/about-dedi/hospitaldedipages/HealthCardBanner";
import NearbyHospitals from "./components/pages/about-dedi/hospitaldedipages/NearbyHospitals";
import ContactInfo from "./components/pages/about-dedi/hospitaldedipages/ContactInfo";
import HospitalMap from "./components/pages/about-dedi/hospitaldedipages/HospitalMap";

// Ayush Card Page
import AyushCardPage from "./pages/AyushCardPage";

// Admin Interface
import AdminLayout from "./layouts/AdminLayout";
import ProtectedRoute from "./components/layout/ProtectedRoute";
import Dashboard from "./pages/admin/Dashboard";
import HealthCard from "./pages/admin/HealthCard/HealthCard";
import HealthCardDetails from "./pages/admin/HealthCard/HealthCardDetails";
import CreateHealthCard from "./pages/admin/HealthCard/CreateHealthCard";
import AdminVerifiedCards from "./pages/admin/HealthCard/VerifiedCards";
import AdminExportedCards from "./pages/admin/HealthCard/ExportedCards";
import AyushVitran from "./pages/admin/HealthCard/AyushVitran";
import Partners from "./pages/admin/Partners/Partners";
import PartnerDetails from "./pages/admin/Partners/PartnerDetails";
import CreatePartner from "./pages/admin/Partners/CreatePartner";
import AdminCamps from "./pages/admin/Camps/Camps";
import AdminCreateCamp from "./pages/admin/Camps/CreateCamp";
import Donations from "./pages/admin/Donations/Donations";
import DonationDetails from "./pages/admin/Donations/DonationDetails";
import HelpSupport from "./pages/admin/HelpSupport/HelpSupport";
import Reports from "./pages/admin/Reports/Reports";
import AdminAttendance from "./pages/admin/Attendance/Attendance";

// Employee Interface
import EmployeeDashboard from "./pages/employee/Dashboard";
import EmployeeHealthCard from "./pages/employee/HealthCard/HealthCard";
import EmployeeHealthCardDetails from "./pages/employee/HealthCard/HealthCardDetails";
import EmployeeCreateHealthCard from "./pages/employee/HealthCard/CreateHealthCard";
import VerifiedCards from "./pages/employee/HealthCard/VerifiedCards";
import EmployeePartners from "./pages/employee/Partners/Partners";
import EmployeePartnerDetails from "./pages/employee/Partners/PartnerDetails";
import EmployeeCreatePartner from "./pages/employee/Partners/CreatePartner";
import EmployeeCamps from "./pages/employee/Camps/Camps";
import EmployeeCreateCamp from "./pages/employee/Camps/CreateCamp";
import EmployeeDonations from "./pages/employee/Donations/Donations";
import EmployeeDonationDetails from "./pages/employee/Donations/DonationDetails";
import EmployeeHelpSupport from "./pages/employee/HelpSupport/HelpSupport";
import EmployeeReports from "./pages/employee/Reports/Reports";
import EmployeeAttendance from "./pages/employee/Attendance/Attendance";

// HR & Payroll
import Employees from "./pages/admin/hr/employees/Employees";
import EmployeeDetails from "./pages/admin/hr/employees/EmployeeDetails";
import CreateEmployee from "./pages/admin/hr/employees/CreateEmployee";

import Salary from "./pages/admin/hr/salary/Salary";
import SalaryDetails from "./pages/admin/hr/salary/SalaryDetails";
import CreateSalary from "./pages/admin/hr/salary/CreateSalary";

function App() {
  return (
    <Router>
      <ScrollToTop />
      <ApplyAyushCardModalProvider>
        <Routes>
          {/* Auth routes */}
          <Route path="/login" element={<Login />} />

          {/* Public QR verification page (no login required) */}
          <Route path="/verify/:cardId" element={<CardVerify />} />

          {/* Home Page */}
          <Route
            path="/"
            element={
              <>
                <Navbar />
                <HeroSection />
                <About />
                <ServicesSection />
                <DonateSection />
                <TestimonialsSection />
                <CertificationsSection />
                <Faqs />
                <Footer />
              </>
            }
          />
          {/* About Page */}
          <Route
            path="/about"
            element={
              <>
                <Navbar />
                <AboutHero />
                <TeamSection />
                <FocusAreas />
                <ImageGallery />
                <Members />
                <Footer />
              </>
            }
          />
          {/* Associated Hospitals Page */}
          <Route
            path="/associated-hospitals"
            element={
              <>
                <Navbar />
                <AssociatedHospitalsHero />
                <Footer />
              </>
            }
          />
          {/* Ayush Card Page */}
          <Route path="/ayush-card" element={<AyushCardPage />} />
          {/* Hospital Detail Page */}
          {/* <Route
          path="/hospitals/:id"
          element={
            <>
              <Navbar />
              <HospitalHero />
              <HospitalAbout />
              <MedicalServices />
              <HospitalFacilities />
              <HealthCardBanner />
              <ContactInfo />
              <HospitalMap />
              
              <NearbyHospitals />
              <Footer />
            </>
          }
        /> */}
          {/* Contact us Page */}
          {/* Contact us Page */}
          <Route
            path="/contact"
            element={
              <>
                <Navbar />
                <ContactUs />
                <Footer />
              </>
            }
          />

          {/* Admin Dashboard — requires valid (non-expired) JWT and Admin role */}
          <Route element={<ProtectedRoute allowedRole="Admin" />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="health-card" element={<HealthCard />} />
              <Route
                path="health-card/verified"
                element={<AdminVerifiedCards />}
              />
              <Route
                path="health-card/exported"
                element={<AdminExportedCards />}
              />
              <Route path="health-card/create" element={<CreateHealthCard />} />
              <Route path="health-card/vitran" element={<AyushVitran />} />
              <Route path="health-card/:id" element={<HealthCardDetails />} />
              <Route path="partners" element={<Partners />} />
              <Route path="partners/create" element={<CreatePartner />} />
              <Route path="partners/:id" element={<PartnerDetails />} />
              <Route path="camps" element={<AdminCamps />} />
              <Route path="camps/create" element={<AdminCreateCamp />} />
              <Route path="camps/:id" element={<AdminCreateCamp />} />
              <Route path="donations" element={<Donations />} />
              <Route path="donations/:id" element={<DonationDetails />} />
              <Route path="my-attendance" element={<EmployeeAttendance />} />
              <Route path="attendance" element={<AdminAttendance />} />
              <Route path="hr/employees" element={<Employees />} />
              <Route path="hr/employees/create" element={<CreateEmployee />} />
              <Route path="hr/employees/:id" element={<EmployeeDetails />} />
              <Route path="hr/salary" element={<Salary />} />
              <Route path="hr/salary/create" element={<CreateSalary />} />
              <Route path="hr/salary/:id" element={<SalaryDetails />} />
              <Route path="reports" element={<Reports />} />
              <Route path="help-support" element={<HelpSupport />} />
            </Route>
          </Route>
          {/* Employee Dashboard */}
          {/* Employee Dashboard — requires valid (non-expired) JWT and Employee role */}
          <Route element={<ProtectedRoute allowedRole="Employee" />}>
            <Route path="/employee" element={<AdminLayout />}>
              <Route index element={<EmployeeDashboard />} />
              <Route path="health-card" element={<EmployeeHealthCard />} />
              <Route path="health-card/verified" element={<VerifiedCards />} />
              <Route
                path="health-card/create"
                element={<EmployeeCreateHealthCard />}
              />
              <Route
                path="health-card/:id"
                element={<EmployeeHealthCardDetails />}
              />
              <Route path="health-card/vitran" element={<AyushVitran />} />
              <Route path="partners" element={<EmployeePartners />} />
              <Route path="partners/create" element={<EmployeeCreatePartner />} />
              <Route path="partners/:id" element={<EmployeePartnerDetails />} />
              <Route path="camps" element={<EmployeeCamps />} />
              <Route path="camps/create" element={<EmployeeCreateCamp />} />
              <Route path="camps/:id" element={<EmployeeCreateCamp />} />
              <Route path="donations" element={<EmployeeDonations />} />
              <Route path="donations/:id" element={<EmployeeDonationDetails />} />
              <Route path="reports" element={<EmployeeReports />} />
              <Route path="attendance" element={<EmployeeAttendance />} />
              <Route path="help-support" element={<EmployeeHelpSupport />} />
            </Route>
          </Route>
        </Routes>
      </ApplyAyushCardModalProvider>
    </Router>
  );
}

export default App;
