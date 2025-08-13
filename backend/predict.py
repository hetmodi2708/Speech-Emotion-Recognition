import librosa
from sklearn.preprocessing import StandardScaler, LabelEncoder
import pickle
import numpy as np
from tensorflow import keras

scaler = StandardScaler()

with open('./model/label_encoder.pkl', 'rb') as f:
    label_encoder = pickle.load(f)

with open('./model/meta_classifier.pkl', 'rb') as f:
    meta_classifier = pickle.load(f)

with open('./model/rf_final.pkl', 'rb') as f:
    rf_final = pickle.load(f)

with open('./model/scaler.pkl', 'rb') as f:
    scaler = pickle.load(f)

cnn_final =  keras.models.load_model('./model/cnn_final.h5')
lstm_final = keras.models.load_model('./model/lstm_final.h5')


def predict_emotion(audio_path, features):
    data, sr = librosa.load(audio_path, duration=2.5, offset=0.6)
    # features = extract_features(data, sr)
    scaled = scaler.transform([features])
    model_input = scaled.reshape(1, -1)
    model_seq_input = scaled.reshape(1, scaled.shape[1], 1)

    cnn_pred = cnn_final.predict(model_seq_input, verbose=0)
    lstm_pred = lstm_final.predict(model_seq_input, verbose=0)
    rf_pred = rf_final.predict_proba(model_input)

    meta_input = np.concatenate([cnn_pred, lstm_pred, rf_pred], axis=1)
    final_pred = meta_classifier.predict(meta_input)
    return label_encoder.inverse_transform(final_pred)[0]

