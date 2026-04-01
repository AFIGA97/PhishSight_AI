import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
import joblib

# -----------------------------
# 1. Training data
# -----------------------------

texts = [
    # phishing (1)
    "Urgent: your account will be closed, click this link to verify now",
    "You won a lottery, claim your prize by entering your password here",
    "Dear user, suspicious login detected, verify your account immediately",
    "Your bank account is locked, confirm your OTP to restore access",
    "Unusual login detected, verify your account immediately using this link",
    "Your password will expire today, click here to keep your account active",
    "We detected suspicious activity, login now to secure your account",
    "Congratulations! You won a lottery, enter your card details to claim",
    "Your package cannot be delivered, pay customs fees via this link",
    "Microsoft support: your PC is infected, call this number now",
    "Do not share this OTP with anyone. Enter it here to finalize payment",
    "Verify your banking information now to avoid account suspension",
    "Update your payment method immediately to avoid service interruption",

    # safe (0)
    "Your package is on the way, track shipment here",
    "Meeting rescheduled to tomorrow, please confirm attendance",
    "Invoice attached for your review, let us know if you have questions",
    "Your order has been shipped and will arrive tomorrow",
    "Your payment of 500 rupees was successful",
    "Happy birthday! Hope you have a great day",
    "Project submission deadline is next Monday",
    "Team lunch scheduled for Friday, please RSVP",
    "Your password was changed successfully as requested",
    "Class timetable has been updated for this week",
    "Reminder: doctor appointment tomorrow at 4 PM",
    "Thank you for your feedback, we appreciate your time"
]

labels = [
    # phishing = 1
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    # safe = 0
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
]

# -----------------------------
# 2. Build DataFrame and split
# -----------------------------

df = pd.DataFrame({"text": texts, "label": labels})

X_train, X_test, y_train, y_test = train_test_split(
    df["text"],
    df["label"],
    test_size=0.3,
    random_state=42
)

# -----------------------------
# 3. Model: TF‑IDF + Logistic Regression
# -----------------------------

model = Pipeline([
    ("tfidf", TfidfVectorizer(stop_words="english")),
    ("clf", LogisticRegression(max_iter=1000))
])

# -----------------------------
# 4. Train and evaluate
# -----------------------------

model.fit(X_train, y_train)

print("Training accuracy:", model.score(X_train, y_train))
print("Test accuracy:", model.score(X_test, y_test))

# -----------------------------
# 5. Save model
# -----------------------------

joblib.dump(model, "phish_model.pkl")
print("Saved model to phish_model.pkl")
