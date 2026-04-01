from fastapi import FastAPI
from pydantic import BaseModel
import joblib
import numpy as np
import pandas as pd
import re
from urllib.parse import urlparse
import csv
from datetime import datetime

app = FastAPI()

# ===================== MODELS =====================

# 1) Text message model (TF-IDF + LogisticRegression pipeline)
text_model = joblib.load("phish_model.pkl")

# 2) URL model (RandomForest trained in Colab with engineered features)
url_model = joblib.load("phish_url_rf.pkl")
url_feature_names = joblib.load("url_feature_names.pkl")  # list of feature column names
print("Loaded URL model:", type(url_model))
print("Number of URL features:", len(url_feature_names))
print("First 5 features:", url_feature_names[:5])

# ===================== SCHEMAS =====================

class Message(BaseModel):
    text: str

class UrlRequest(BaseModel):
    url: str

class Feedback(BaseModel):
    item_type: str    # "url" or "text"
    content: str      # url or message text
    model_label: str  # "safe" or "phishing"
    user_label: str   # "safe" or "scam"

# ===================== UTILS =====================

def extract_url_features(url: str) -> dict:
    url = str(url)
    parsed = urlparse(url)

    hostname = parsed.netloc or ""
    path = parsed.path or ""
    query = parsed.query or ""
    scheme = parsed.scheme or ""

    url_len = len(url)
    host_len = len(hostname)
    path_len = len(path)

    features = {
        "url_length": url_len,
        "host_length": host_len,
        "path_length": path_len,
        "num_dots": url.count("."),
        "num_hyphens": url.count("-"),
        "num_at": url.count("@"),
        "num_question": url.count("?"),
        "num_equal": url.count("="),
        "num_slash": url.count("/"),
        "num_percent": url.count("%"),
        "num_digits": sum(c.isdigit() for c in url),
        "num_special_chars": sum(c in "@%&=?-_." for c in url),
        "has_ip": 1 if re.search(r"\b\d{1,3}(?:\.\d{1,3}){3}\b", hostname) else 0,
        "uses_https": 1 if scheme == "https" else 0,
        "num_subdomains": hostname.count("."),
    }

    suspicious_words = [
        "login", "verify", "account", "update", "secure",
        "webscr", "banking", "confirm", "password", "signin",
        "paypal", "ebay", "amazon", "apple", "google"
    ]

    text_part = (hostname + path + query).lower()
    for w in suspicious_words:
        features[f"kw_{w}"] = 1 if w in text_part else 0

    features["digit_ratio"] = features["num_digits"] / url_len if url_len > 0 else 0
    features["special_ratio"] = features["num_special_chars"] / url_len if url_len > 0 else 0

    return features

def to_safe_score(p: float) -> int:
    """
    Map safe-class probability p (0–1) to a 0–100 safety score,
    with bands: 0–30 (danger), 31–69 (uncertain), 70–100 (safer).
    """
    p = max(0.0, min(1.0, p))
    if p < 0.4:
        return int((p / 0.4) * 30)              # 0–30
    elif p < 0.7:
        return 31 + int(((p - 0.4) / 0.3) * 38) # 31–69
    else:
        return 70 + int(((p - 0.7) / 0.3) * 30) # 70–100

# ===================== ROUTES =====================

@app.get("/")
def read_root():
    return {"status": "PhishSight API running"}

# ---- Text / message analysis ----
@app.post("/analyze_message")
def analyze_message(msg: Message):
    # 1. Predict probabilities: [prob_safe, prob_phishing]
    proba = text_model.predict_proba([msg.text])[0]
    pred = int(proba[1] >= 0.5)  # 1 = phishing, 0 = safe

    label = "phishing" if pred == 1 else "safe"
    confidence = float(proba[pred])

    # 2. Simple explanation: highest-scoring words for phishing class
    tfidf = text_model.named_steps["tfidf"]
    clf = text_model.named_steps["clf"]

    vec = tfidf.transform([msg.text])
    feature_names = tfidf.get_feature_names_out()

    # scores for phishing class (class index 0 or 1 depending on how you trained)
    # assuming clf.coef_[0] corresponds to phishing class
    scores = vec.toarray()[0] * clf.coef_[0]
    top_idx = scores.argsort()[-5:][::-1]  # top 5
    highlight_tokens = [feature_names[i] for i in top_idx if scores[i] > 0]

    tip = "Be cautious of urgent language and links asking for passwords."

    return {
        "label": label,
        "confidence": confidence,
        "highlight_tokens": highlight_tokens,
        "risky_urls": [],
        "tip": tip,
    }

# ---- URL analysis ----
@app.post("/predict_url")
def predict_url(req: UrlRequest):
    feats_dict = extract_url_features(req.url)
    # Ensure columns match training order
    X_input = pd.DataFrame([feats_dict])[url_feature_names]

    proba = url_model.predict_proba(X_input)[0]   # e.g. [prob_bad, prob_good] or [prob_good, prob_bad]

    # IMPORTANT: adjust these indices if your model order is opposite
    prob_bad = float(proba[0])
    prob_good = float(proba[1])

    safe_score = to_safe_score(prob_good)

    # risk bands from probabilities
    if prob_bad >= 0.8:
        label = "phishing"
        risk_level = "high_phishing"
    elif prob_good >= 0.8:
        label = "safe"
        risk_level = "high_safe"
    else:
        label = "uncertain"
        risk_level = "medium"

    return {
        "label": label,
        "risk_level": risk_level,
        "prob_good": prob_good,
        "safe_score": safe_score
    }

# ===================== FEEDBACK CSV =====================

FEEDBACK_FILE = "feedback.csv"

# Ensure CSV has header row once
def init_feedback_file():
    try:
        with open(FEEDBACK_FILE, "x", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([
                "timestamp",
                "item_type",
                "content",
                "model_label",
                "user_label"
            ])
    except FileExistsError:
        pass

init_feedback_file()

@app.post("/feedback")
def save_feedback(fb: Feedback):
    timestamp = datetime.utcnow().isoformat()
    with open(FEEDBACK_FILE, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            timestamp,
            fb.item_type,
            fb.content,
            fb.model_label,
            fb.user_label
        ])
    return {"status": "ok"}
