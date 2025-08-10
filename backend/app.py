from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from preprocess import preprocess_audio_file
from predict import predict_emotion
from pydub import AudioSegment
from pydub.exceptions import CouldntDecodeError
import os
import subprocess
import uuid
import logging
from pathlib import Path
from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi import Request


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# Configuration
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB limit
ALLOWED_EXTENSIONS = {".wav", ".mp3", ".webm", ".m4a", ".ogg"}
UPLOAD_DIR = "temp_uploads"

# Ensure upload directory exists
os.makedirs(UPLOAD_DIR, exist_ok=True)

origins = [
    'http://localhost:5173'
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def check_ffmpeg_available():
    """Check if ffmpeg is available in the system"""
    try:
        subprocess.run(["ffmpeg", "-version"], 
                      capture_output=True, check=True, timeout=10)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        return False

def validate_file(file: UploadFile) -> tuple[bool, str]:
    """Validate uploaded file"""
    if not file.filename:
        return False, "No filename provided"
    
    check_filename = os.path.basename(file.filename)
    file_ext = Path(file.filename).suffix.lower()

    # if '..' in check_filename or '/' in check_filename or '\\' in check_filename:
    #     return False, "Invalid filename"

    if file_ext not in ALLOWED_EXTENSIONS:
        return False, f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
    
    return True, "Valid"

def convert_to_wav_with_pydub(input_path: str, output_path: str) -> bool:
    """Convert audio file to WAV using pydub as fallback"""
    try:
        audio = AudioSegment.from_file(input_path)
        # Ensure consistent format: 22050 Hz, mono
        audio = audio.set_frame_rate(22050).set_channels(1)
        audio.export(output_path, format="wav")
        logger.info(f"Successfully converted {input_path} to WAV using pydub")
        return True
    except CouldntDecodeError as e:
        logger.error(f"Pydub couldn't decode file {input_path}: {e}")
        return False
    except Exception as e:
        logger.error(f"Error converting with pydub: {e}")
        return False

def convert_to_wav_with_ffmpeg(input_path: str, output_path: str) -> bool:
    upload_dir = os.path.abspath(UPLOAD_DIR)
    if not (os.path.abspath(input_path).startswith(upload_dir) and 
            os.path.abspath(output_path).startswith(upload_dir)):
        logger.error("Invalid file paths for conversion")
        return False
    try:
        cmd = [
            "ffmpeg", "-y", "-i", input_path,
            "-ar", "22050", "-ac", "1",  # 22050 Hz sample rate, mono
            "-acodec", "pcm_s16le",     # 16-bit PCM
            output_path
        ]
        
        result = subprocess.run(
            cmd, 
            capture_output=True, 
            text=True, 
            timeout=30,  # 30 second timeout
            check=True
        )
        
        logger.info(f"Successfully converted {input_path} to WAV using ffmpeg")
        return True
        
    except subprocess.TimeoutExpired:
        logger.error(f"FFmpeg conversion timed out for {input_path}")
        return False
    except subprocess.CalledProcessError as e:
        logger.error(f"FFmpeg conversion failed: {e.stderr}")
        return False
    except Exception as e:
        logger.error(f"Unexpected error in ffmpeg conversion: {e}")
        return False

def convert_audio_to_wav(input_path: str, output_path: str) -> bool:
    """Convert audio file to WAV format with fallback methods"""
    
    # First try ffmpeg if available
    if check_ffmpeg_available():
        if convert_to_wav_with_ffmpeg(input_path, output_path):
            return True
        logger.warning("FFmpeg conversion failed, trying pydub...")
    
    # Fallback to pydub
    return convert_to_wav_with_pydub(input_path, output_path)

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.post("/predict")
@limiter.limit("10/minute")
async def predict_emotion_api(request: Request, file: UploadFile = File(...)):
    """Predict emotion from uploaded audio file"""
    
    # Generate unique identifiers for this request
    request_id = str(uuid.uuid4())
    
    # File paths
    original_path = None
    wav_path = None
    
    try:
        # Validate file
        is_valid, validation_message = validate_file(file)
        if not is_valid:
            logger.warning(f"File validation failed: {validation_message}")
            raise HTTPException(status_code=400, detail=validation_message)
        
        

        # Read file contents
        contents = await file.read()
        
        # Check if file is empty
        if len(contents) == 0:
            logger.warning("Empty file uploaded")
            raise HTTPException(status_code=400, detail="Uploaded file is empty")
        
        # Check file size
        if len(contents) > MAX_FILE_SIZE:
            logger.warning(f"File too large: {len(contents)} bytes")
            raise HTTPException(
                status_code=413, 
                detail=f"File too large. Maximum size: {MAX_FILE_SIZE // (1024*1024)}MB"
            )
        
        # Create unique file paths
        file_ext = Path(file.filename).suffix.lower()
        original_path = os.path.join(UPLOAD_DIR, f"{request_id}_original{file_ext}")
        wav_path = os.path.join(UPLOAD_DIR, f"{request_id}_converted.wav")
        
        # Save uploaded file
        with open(original_path, "wb") as f:
            f.write(contents)
        
        

        # Verify file was written correctly
        if not os.path.exists(original_path) or os.path.getsize(original_path) == 0:
            logger.error("Failed to save uploaded file or file is empty")
            raise HTTPException(status_code=500, detail="Failed to process uploaded file")
        

        logger.info(f"Processing audio file: {file.filename} (size: {len(contents)} bytes)")
        
        # Convert to WAV format
        conversion_success = convert_audio_to_wav(original_path, wav_path)
        
        if not conversion_success:
            logger.error("Audio conversion failed with all methods")
            raise HTTPException(
                status_code=422, 
                detail="Could not process audio file. Please ensure it's a valid audio format."
            )
        
        # Verify converted file exists and has content
        if not os.path.exists(wav_path) or os.path.getsize(wav_path) == 0:
            logger.error("Converted WAV file is missing or empty")
            raise HTTPException(status_code=500, detail="Audio conversion produced invalid output")
        
        # Process audio file
        try:
            features = preprocess_audio_file(wav_path)
            if features is None:
                raise HTTPException(status_code=422, detail="Could not extract features from audio")
                
        except Exception as e:
            logger.error(f"Feature extraction failed: {e}")
            raise HTTPException(status_code=422, detail="Could not extract audio features")
        
        # Predict emotion
        try:
            predicted_emotion = predict_emotion(wav_path, features)
            if predicted_emotion is None:
                raise HTTPException(status_code=500, detail="Emotion prediction failed")
                
        except Exception as e:
            logger.error(f"Emotion prediction failed: {e}")
            raise HTTPException(status_code=500, detail="Emotion prediction failed")
        
        logger.info(f"Successfully predicted emotion: {predicted_emotion}")
        return JSONResponse(
            content={"predicted_emotion": predicted_emotion}, 
            status_code=200
        )
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error(f"Unexpected error in predict_emotion_api: {e}")
        raise HTTPException(status_code=500, detail="Internal server error occurred")
        
    finally:
        # Always clean up temporary files
        cleanup_files = [original_path, wav_path]
        for file_path in cleanup_files:
            if file_path and os.path.exists(file_path):
                try:
                    os.remove(file_path)
                    logger.debug(f"Cleaned up file: {file_path}")
                except Exception as e:
                    logger.warning(f"Could not remove temporary file {file_path}: {e}")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    ffmpeg_available = check_ffmpeg_available()
    return {
        "status": "healthy",
        "ffmpeg_available": ffmpeg_available,
        "max_file_size_mb": MAX_FILE_SIZE // (1024 * 1024),
        "allowed_formats": list(ALLOWED_EXTENSIONS)
    }

@app.on_event("startup")
async def startup_event():
    logger.info("Starting Speech Emotion Recognition API")
    
    # Check dependencies
    ffmpeg_available = check_ffmpeg_available()
    if not ffmpeg_available:
        logger.warning("FFmpeg not available - will use pydub as fallback")
    else:
        logger.info("FFmpeg is available")

    required_files = [
        './model/label_encoder.pkl',
        './model/meta_classifier.pkl',
        './model/rf_final.pkl',
        './model/scaler.pkl',
        './model/cnn_final.h5',
        './model/lstm_final.h5'
    ]
    
    for file_path in required_files:
        if not os.path.exists(file_path):
            logger.error(f"Required model file missing: {file_path}")
            raise RuntimeError(f"Model file not found: {file_path}")

@app.on_event("shutdown")
async def shutdown_event():
    """Application shutdown tasks"""
    logger.info("Shutting down Speech Emotion Recognition API")
    
    # Clean up any remaining temporary files
    try:
        if os.path.exists(UPLOAD_DIR):
            for file_path in os.listdir(UPLOAD_DIR):
                full_path = os.path.join(UPLOAD_DIR, file_path)
                if os.path.isfile(full_path):
                    os.remove(full_path)
                    logger.debug(f"Cleaned up remaining file: {full_path}")
    except Exception as e:
        logger.warning(f"Error during cleanup: {e}")