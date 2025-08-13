import { useState, useEffect } from "react";
import axios from "axios";
import Lottie from "lottie-react";
import Navbar from "../components/Navbar";
import loadingAnimation from "../assets/Loading_sand_clock.json";
import { emotionAnimations } from "../components/emotionAnimations";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Snackbar,
} from "@mui/material";
import { useReactMediaRecorder } from "react-media-recorder";
import MicIcon from "@mui/icons-material/Mic";

// Configuration
const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://35.182.111.179:8000";
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_FILE_TYPES = [".wav", ".mp3", ".webm", ".m4a", ".ogg"];
const MAX_RECORDING_TIME = 300000; // 5 minutes in milliseconds
const MIN_RECORDING_TIME = 3000; // 3 seconds minimum
const REQUEST_TIMEOUT = 60000; // 60 seconds

if (!API_BASE_URL) {
  throw new Error("VITE_API_URL environment variable is required");
}

const PredictionPage = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [file, setFile] = useState(null);
  const [predict, setPredict] = useState(null);
  const [isRecordingDialogOpen, setIsRecordingDialogOpen] = useState(false);
  const [error, setError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [recordingTimer, setRecordingTimer] = useState(0);
  const [recordingInterval, setRecordingInterval] = useState(null);

  // File validation function
  const validateFile = (selectedFile) => {
    if (!selectedFile) {
      return "No file selected";
    }

    const fileName = selectedFile.name.toLowerCase();
    const fileExtension = fileName.substring(fileName.lastIndexOf("."));

    if (!ALLOWED_FILE_TYPES.includes(fileExtension)) {
      return `Unsupported file type. Allowed formats: ${ALLOWED_FILE_TYPES.join(
        ", "
      )}`;
    }
    const allowedMimes = [
      "audio/wav",
      "audio/mpeg",
      "audio/webm",
      "audio/mp4",
      "audio/ogg",
      "audio/x-m4a",
    ];
    if (!allowedMimes.includes(selectedFile.type)) {
      return `Invalid file format detected. Expected audio file.`;
    }
    if (selectedFile.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size: ${MAX_FILE_SIZE / (1024 * 1024)}MB`;
    }

    if (selectedFile.size === 0) {
      return "File is empty";
    }
    if (fileName.includes("../") || fileName.includes("..\\")) {
      return "Invalid filename";
    }
    return null;
  };

  // Audio validation function
  const validateAudioContent = async (audioBlob) => {
    return new Promise((resolve) => {
      const audio = new Audio();
      const url = URL.createObjectURL(audioBlob);

      audio.addEventListener("loadedmetadata", () => {
        URL.revokeObjectURL(url);

        // Check duration
        if (audio.duration < MIN_RECORDING_TIME / 1000) {
          resolve("Recording too short. Please record for at least 3 seconds.");
          return;
        }

        // Check if audio has content (basic check)
        const audioContext = new (window.AudioContext ||
          window.webkitAudioContext)();
        const reader = new FileReader();

        reader.onload = async (e) => {
          try {
            const arrayBuffer = e.target.result;
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            // Check for silence (very basic check)
            let hasSound = false;
            for (
              let channel = 0;
              channel < audioBuffer.numberOfChannels;
              channel++
            ) {
              const channelData = audioBuffer.getChannelData(channel);
              for (let i = 0; i < channelData.length; i++) {
                if (Math.abs(channelData[i]) > 0.01) {
                  // Threshold for "sound"
                  hasSound = true;
                  break;
                }
              }
              if (hasSound) break;
            }

            if (!hasSound) {
              resolve(
                "No audio detected. Please ensure your microphone is working and try again."
              );
            } else {
              resolve(null); // No error
            }
          } catch (error) {
            console.warn(
              "Audio content validation failed, proceeding anyway:",
              error
            );
            resolve(null); // Proceed if validation fails
          } finally {
            reader.readAsArrayBuffer(audioBlob);
            if (audioContext) {
              audioContext.close();
            }
          }
        };
      });

      audio.addEventListener("error", () => {
        URL.revokeObjectURL(url);
        resolve("Invalid audio file");
      });

      audio.src = url;
    });
  };

  // Clear error after some time
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Handle file selection
  function handleFile(event) {
    const selectedFile = event.target.files[0];

    if (!selectedFile) return;

    const validationError = validateFile(selectedFile);
    if (validationError) {
      setError(validationError);
      event.target.value = ""; // Clear input
      return;
    }

    setPredict(null);
    setError("");
    setFile(selectedFile);
  }

  // Create axios instance with timeout
  const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: REQUEST_TIMEOUT,
  });

  // Enhanced error handling function
  const handleApiError = (error) => {
    console.error("API error:", error);

    if (error.code === "ECONNABORTED") {
      setError("Request timed out. Please try again.");
    } else if (error.response) {
      // Server responded with error status
      const status = error.response.status;
      const message =
        error.response.data?.detail ||
        error.response.data?.error ||
        "Unknown error";

      switch (status) {
        case 400:
          setError(`Invalid file: ${message}`);
          break;
        case 413:
          setError("File too large. Please choose a smaller file.");
          break;
        case 422:
          setError(`Could not process audio: ${message}`);
          break;
        case 500:
          setError("Backend server error. Please try again later.");
          break;
        case 502:
        case 503:
        case 504:
          setError(
            "Backend server is currently offline. Please try again later."
          );
          break;
        default:
          setError(`Server error ${status}: ${message}`);
      }
    } else if (error.request) {
      // Network error - differentiate between offline backend and network issues
      if (error.message?.includes("Network Error") || !navigator.onLine) {
        setError(
          "Network connection error. Please check your internet connection."
        );
      } else {
        setError("Cannot reach the server. The backend may be offline.");
      }
    } else {
      setError("An unexpected error occurred. Please try again.");
    }
  };

  // Handle file upload
  async function handleUpload() {
    if (!file) {
      setError("Please select a file first");
      return;
    }

    if (isLoading || isUploading) {
      return; // Prevent multiple simultaneous uploads
    }

    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setPredict(null);
      setIsLoading(true);
      setIsUploading(true);
      setError("");

      const formData = new FormData();
      formData.append("file", file);

      const response = await apiClient.post("/predict", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      if (response.data && response.data.predicted_emotion) {
        setPredict(response.data.predicted_emotion);
      } else {
        throw new Error("Invalid response format");
      }
    } catch (error) {
      handleApiError(error);
    } finally {
      setIsLoading(false);
      setIsUploading(false);
    }
  }

  // Handle record button click
  function handleRecord() {
    setFile(null);
    setPredict(null);
    setError("");
    setPermissionDenied(false);
    resetRecordingTimer(); // Fix: Reset timer properly
    setIsRecordingDialogOpen(true);
  }

  // Reset recording timer function
  const resetRecordingTimer = () => {
    if (recordingInterval) {
      clearInterval(recordingInterval);
      setRecordingInterval(null);
    }
    setRecordingTimer(0);
  };

  // Close recording dialog
  function onCloseRecordingDialog() {
    // Fix: Only allow closing if not currently recording
    if (status === "recording") {
      return; // Don't close dialog while recording
    }

    setIsRecordingDialogOpen(false);
    resetRecordingTimer();
    clearBlobUrl();
  }

  // Recording controls with permission handling
  const {
    status,
    startRecording: originalStartRecording,
    stopRecording: originalStopRecording,
    mediaBlobUrl,
    clearBlobUrl,
    error: mediaRecorderError,
  } = useReactMediaRecorder({
    audio: true,
    onStop: (blobUrl, blob) => {
      resetRecordingTimer(); // Fix: Properly reset timer when recording stops
    },
  });

  useEffect(() => {
    return () => {
      if (mediaBlobUrl) {
        URL.revokeObjectURL(mediaBlobUrl);
      }
    };
  }, [mediaBlobUrl]);

  // Enhanced start recording with permission handling
  const startRecording = async () => {
    try {
      // Check microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop()); // Stop the test stream

      resetRecordingTimer(); // Fix: Reset timer before starting new recording
      originalStartRecording();

      // Start timer
      const interval = setInterval(() => {
        setRecordingTimer((prev) => {
          if (prev >= MAX_RECORDING_TIME / 1000) {
            originalStopRecording();
            clearInterval(interval);
            setError("Recording stopped: Maximum duration reached (5 minutes)");
            return 0;
          }
          return prev + 1;
        });
      }, 1000);

      setRecordingInterval(interval);
    } catch (err) {
      console.error("Microphone permission denied:", err);
      setPermissionDenied(true);
      setError(
        "Microphone access denied. Please allow microphone access and try again."
      );
    }
  };

  // Enhanced stop recording
  const stopRecording = () => {
    originalStopRecording();
    resetRecordingTimer();
  };

  // Handle recording upload with validation
  const handleRecordUpload = async () => {
    if (!mediaBlobUrl || isLoading || isUploading) {
      return;
    }

    try {
      setIsLoading(true);
      setIsUploading(true);
      setError("");

      const blob = await fetch(mediaBlobUrl).then((r) => r.blob());

      if (!blob || blob.size === 0) {
        throw new Error("Recording is empty");
      }

      // Validate audio content
      const audioValidationError = await validateAudioContent(blob);
      if (audioValidationError) {
        setError(audioValidationError);
        return;
      }

      const formData = new FormData();
      formData.append("file", blob, "recorded_audio.webm");

      const response = await apiClient.post("/predict", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      if (response.data && response.data.predicted_emotion) {
        setPredict(response.data.predicted_emotion);
        setIsRecordingDialogOpen(false); // Close dialog on success
        resetRecordingTimer();
        clearBlobUrl();
      } else {
        throw new Error("Invalid response format");
      }
    } catch (error) {
      if (
        (error.message && error.message.includes("Recording too short")) ||
        error.message.includes("No audio detected")
      ) {
        setError(error.message);
      } else {
        handleApiError(error);
      }
    } finally {
      setIsLoading(false);
      setIsUploading(false);
    }
  };

  // Clear all states
  const handleClear = () => {
    setFile(null);
    setPredict(null);
    setError("");
    setIsLoading(false);
    setIsUploading(false);
    resetRecordingTimer();
  };

  // Format recording timer
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="relative flex size-full min-h-screen flex-col bg-[#111817] dark justify-normal group/design-root overflow-x-hidden">
      <Navbar />

      {/* Error Snackbar */}
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError("")}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          onClose={() => setError("")}
          severity="error"
          sx={{ width: "100%" }}
        >
          {error}
        </Alert>
      </Snackbar>

      <div className="min-h-svh bg-[#111817]">
        <div className="flex items-center p-4 pb-2 justify-between">
          <div
            className="text-white flex size-12 shrink-0 items-center"
            data-icon="ArrowLeft"
            data-size="24px"
            data-weight="regular"
          ></div>
          <h2 className="text-white text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center pr-12">
            Audio Analysis
          </h2>
        </div>

        <div className="flex justify-between items-center px-4 pb-4 pt-4">
          <h3 className="text-white text-lg font-bold leading-tight tracking-[-0.015em]">
            Upload or Record Audio
          </h3>

          {(file || predict) && (
            <button
              onClick={handleClear}
              className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors"
              disabled={isLoading || isUploading}
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex justify-stretch bg-[#111817] pt-4">
          <div className="flex flex-1 gap-3 flex-wrap px-4 py-3 justify-between">
            {file && (
              <div className="flex flex-row gap-2 items-center">
                <p className="text-white">
                  Uploaded File: {file?.name || "None"}
                </p>
                <label className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-full h-10 px-4 bg-[#283936] text-white text-sm font-bold leading-normal tracking-[0.015em] hover:bg-[#3a4b48] transition-colors">
                  Change File
                  <input
                    type="file"
                    accept={ALLOWED_FILE_TYPES.join(",")}
                    onChange={handleFile}
                    hidden
                    disabled={isLoading || isUploading}
                  />
                </label>
                <button
                  className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-full h-10 px-4 bg-[#283936] text-white text-sm font-bold leading-normal tracking-[0.015em] hover:bg-[#3a4b48] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleUpload}
                  disabled={isLoading || isUploading}
                >
                  <span className="truncate">
                    {isUploading ? "Uploading..." : "Upload"}
                  </span>
                </button>
              </div>
            )}

            {!file && (
              <div>
                <label className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-full h-10 px-4 bg-[#283936] text-white text-sm font-bold leading-normal tracking-[0.015em] hover:bg-[#3a4b48] transition-colors">
                  Upload Audio File
                  <input
                    type="file"
                    accept={ALLOWED_FILE_TYPES.join(",")}
                    onChange={handleFile}
                    hidden
                    disabled={isLoading || isUploading}
                  />
                </label>
              </div>
            )}

            <div>
              <button
                className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-full h-10 px-4 bg-[#0beec8] text-[#111817] text-sm font-bold leading-normal tracking-[0.015em] hover:bg-[#09d4b8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleRecord}
                disabled={isLoading || isUploading}
              >
                <MicIcon />
                <span className="truncate">Record</span>
              </button>

              {/* Recording Dialog */}
              <Dialog
                open={isRecordingDialogOpen}
                onClose={onCloseRecordingDialog}
                fullWidth
                maxWidth="sm"
                disableEscapeKeyDown={status === "recording"} // Prevent closing while recording
              >
                <div className="bg-[#575959] text-white p-6 rounded-2xl shadow-2xl border border-[#2a2a2a]">
                  <DialogTitle className="text-lg text-center font-semibold text-white">
                    Record Your Voice
                  </DialogTitle>

                  <DialogContent className="mt-3 space-y-4">
                    <div className="text-center">
                      <p className="text-md text-gray-300">Status: {status}</p>
                      {status === "recording" && (
                        <p className="text-sm text-yellow-400">
                          Recording: {formatTime(recordingTimer)} / 5:00
                        </p>
                      )}
                    </div>

                    {permissionDenied && (
                      <Alert severity="warning" className="mb-4">
                        Microphone access denied. Please allow microphone access
                        in your browser settings and try again.
                      </Alert>
                    )}

                    {mediaRecorderError && (
                      <Alert severity="error" className="mb-4">
                        Recording error: {mediaRecorderError}
                      </Alert>
                    )}

                    {status !== "recording" && !permissionDenied ? (
                      <button
                        onClick={startRecording}
                        className="w-full px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50"
                        disabled={isLoading || isUploading}
                      >
                        Start Recording
                      </button>
                    ) : status === "recording" ? (
                      <button
                        onClick={stopRecording}
                        className="w-full px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-600 text-black font-medium transition-colors"
                      >
                        Stop Recording
                      </button>
                    ) : null}

                    {mediaBlobUrl && status !== "recording" && (
                      <div className="space-y-3">
                        <audio
                          src={mediaBlobUrl}
                          controls
                          className="w-full mt-2 rounded"
                        />
                        <button
                          onClick={handleRecordUpload}
                          className="w-full px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 transition-colors disabled:opacity-50"
                          disabled={isLoading || isUploading}
                        >
                          {isUploading ? "Processing..." : "Use This Recording"}
                        </button>
                      </div>
                    )}
                  </DialogContent>

                  <DialogActions className="flex justify-end mt-4">
                    <button
                      onClick={onCloseRecordingDialog}
                      className={`text-md w-fit p-2 text-white rounded transition-colors ${
                        status === "recording"
                          ? "bg-gray-500 cursor-not-allowed opacity-50"
                          : "bg-red-500 hover:bg-red-600"
                      }`}
                      disabled={status === "recording"}
                      title={
                        status === "recording"
                          ? "Stop recording first to cancel"
                          : "Cancel"
                      }
                    >
                      Cancel
                    </button>
                  </DialogActions>
                </div>
              </Dialog>
            </div>
          </div>
        </div>

        {/* Results Display */}
        <div className="flex flex-row w-full grow bg-[#111817] max-h-96 @container p-4">
          <div className="w-full justify-center items-center gap-1 overflow-hidden bg-[#111817] @[480px]:gap-2 aspect-[2/3] rounded-xl flex flex-col">
            {isLoading && (
              <>
                <Lottie
                  animationData={loadingAnimation}
                  loop
                  autoplay
                  className="max-h-52 h-52"
                />
                <p className="text-white mt-2">Analyzing audio...</p>
              </>
            )}

            {!isLoading && predict && (
              <>
                <Lottie
                  animationData={emotionAnimations[predict]}
                  loop
                  autoplay
                  className="h-52 max-h-52"
                />
                <p className="text-white mt-2 text-lg font-semibold capitalize">
                  Detected Emotion: {predict}
                </p>
              </>
            )}

            {!isLoading && !predict && !file && (
              <div className="text-center text-gray-400">
                <p>
                  Upload an audio file or record your voice to analyze emotions
                </p>
                <p className="text-sm mt-2">
                  Supported formats: {ALLOWED_FILE_TYPES.join(", ")}
                </p>
                <p className="text-sm">
                  Max file size: {MAX_FILE_SIZE / (1024 * 1024)}MB
                </p>
                <p className="text-sm">Minimum recording duration: 3 seconds</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PredictionPage;
