#!/usr/bin/env python3
import json
import re
from textblob import TextBlob
from datetime import datetime, timezone


def clean_text(text):
    if not text:
        return ""
    text = re.sub(r"http\S+|www\S+", "", text)
    text = re.sub(r"[^A-Za-z0-9\s.,!?]", " ", text)
    return text.strip()


def sentiment_score(text):
    if not text:
        return 0.5
    try:
        blob = TextBlob(text)
        score = (blob.sentiment.polarity + 1) / 2  # normalize 0–1
        return round(score, 3)
    except Exception:
        return 0.5


def summarize_app(app):
    """Compute aggregated sentiment + ratings for each app."""
    ios_rating = app.get("apple", {}).get("summary", {}).get("average_rating")
    android_rating = app.get("google", {}).get("summary", {}).get("average_rating")

    # Combine reviews
    reviews = []
    for store in ["apple", "google"]:
        reviews.extend(app.get(store, {}).get("reviews", []))

    for r in reviews:
        r["clean_text"] = clean_text(r.get("text", ""))
        r["sentiment"] = sentiment_score(r["clean_text"])

    # average sentiment
    sentiments = [r["sentiment"] for r in reviews if "sentiment" in r]
    avg_sentiment = round(sum(sentiments) / len(sentiments), 3) if sentiments else 0.5

    # sort top/bottom reviews
    sorted_reviews = sorted(reviews, key=lambda x: x["sentiment"], reverse=True)
    top_positive = sorted_reviews[:3]
    top_negative = sorted_reviews[-3:]

    # Derive basic "drivers"
    driver_words = ["crash", "buffer", "slow", "ads", "stream", "update", "login"]
    driver_counts = {}
    for r in reviews:
        text = r["clean_text"].lower()
        for w in driver_words:
            if w in text:
                driver_counts[w] = driver_counts.get(w, 0) + 1

    drivers = [
        {"label": w, "trend": "worsening" if c > 2 else "steady"}
        for w, c in sorted(driver_counts.items(), key=lambda x: -x[1])
    ][:5]

    return {
        "appName": app["app_name"],
        "ios": {"rating": ios_rating or 0},
        "android": {"rating": android_rating or 0},
        "sentiment": {
            "score": avg_sentiment,
            "scoreDelta": 0,
            "topPositive": [
                {"text": r["text"], "rating": r.get("rating"), "platform": r.get("platform")}
                for r in top_positive
            ],
            "topNegative": [
                {"text": r["text"], "rating": r.get("rating"), "platform": r.get("platform")}
                for r in top_negative
            ],
            "drivers": drivers,
        },
    }


def main():
    with open("store_data_raw.json", encoding="utf-8") as f:
        raw = json.load(f)

    apps_raw = raw.get("apps", [])
    results = [summarize_app(a) for a in apps_raw]

    out = {
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "apps": results,
    }

    with open("app-metrics.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"[INFO] Wrote app-metrics.json for {len(results)} apps.")


if __name__ == "__main__":
    main()
