/** User-facing message for getUserMedia failures */
export function getCameraErrorMessage(err) {
  if (!err) return "Unable to access camera.";
  const name = err?.name || "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Camera permission denied. Allow camera access in your browser settings.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera found on this device.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Camera is in use by another app. Close it and try again.";
  }
  if (name === "NotSupportedError" || name === "SecurityError") {
    return "Camera is not available. Use gallery upload or open the site over HTTPS.";
  }
  if (name === "OverconstrainedError") {
    return "Could not use the requested camera. Try again or use gallery upload.";
  }
  return "Unable to access camera. Please use gallery upload.";
}

/**
 * Request camera with mobile-safe fallbacks (environment → user → any).
 */
export async function requestCameraStream({ preferEnvironment = true } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    const err = new Error("Camera not supported");
    err.name = "NotSupportedError";
    throw err;
  }

  const attempts = preferEnvironment
    ? [
        {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        {
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        { video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } },
        { video: true },
      ]
    : [{ video: true }];

  let lastError;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastError = err;
      if (
        err?.name === "NotAllowedError" ||
        err?.name === "PermissionDeniedError"
      ) {
        throw err;
      }
    }
  }
  throw lastError || new Error("Unable to access camera");
}

export function stopMediaStream(stream) {
  if (!stream?.getTracks) return;
  stream.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  });
}

export function detachVideoElement(videoEl) {
  if (!videoEl) return;
  try {
    videoEl.pause?.();
  } catch {
    /* ignore */
  }
  videoEl.srcObject = null;
}

/** Attach stream and start playback (required on many mobile browsers). */
export async function attachStreamToVideo(videoEl, stream) {
  if (!videoEl || !stream) return false;
  detachVideoElement(videoEl);
  videoEl.srcObject = stream;
  videoEl.muted = true;
  videoEl.playsInline = true;
  try {
    await videoEl.play();
    return true;
  } catch (err) {
    console.warn("Video play failed:", err);
    return false;
  }
}
