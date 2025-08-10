import numpy as np
import librosa

def extract_features(data, sample_rate):
    result = np.array([])
    result = np.hstack((result, np.mean(librosa.feature.zero_crossing_rate(y=data).T, axis=0)))
    stft = np.abs(librosa.stft(data))
    result = np.hstack((result, np.mean(librosa.feature.chroma_stft(S=stft, sr=sample_rate).T, axis=0)))
    result = np.hstack((result, np.mean(librosa.feature.mfcc(y=data, sr=sample_rate).T, axis=0)))
    result = np.hstack((result, np.mean(librosa.feature.rms(y=data).T, axis=0)))
    result = np.hstack((result, np.mean(librosa.feature.melspectrogram(y=data, sr=sample_rate).T, axis=0)))
    return result

def preprocess_audio_file(file_path):
    data, sr = librosa.load(file_path, duration=2.5, offset=0.6)
    features = extract_features(data, sr)
    return features