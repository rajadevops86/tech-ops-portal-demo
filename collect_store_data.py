#!/usr/bin/env python3
import json
import time
from datetime import datetime, timezone

import requests
from google_play_scraper import app as gp_app, reviews as gp_reviews, Sort as GP_Sort


# ---------- CONFIG: APPS WE TRACK ----------

APPS = [
    {
        "app_name": "Aha",
        "apple": {
            "app_id": "1488739001",
            "country": "in",
        },
        "google": {
            "package": "ahaflix.tv",
            "lang": "en",
            "country": "in",
        },
    },
    {
        "app_name": "Pilipinas Live",
        "apple": {
            "app_id": "1673495447",
            "country": "ph",
        },
        "google": {
            "package": "tv.pilipinalive.app",
            "lang": "en",
            "country": "ph",
        },
    },
    {
        "app_name": "Unifi TV 2.0",
        "apple": {
            "app_id": "6739202371",
            "country": "my",
        },
        "google": {
            "package": "com.tm.unifitv.mobile",
            "lang": "en",
            "country": "my",
        },
    },
    {
        "app_name": "Univision",
        "apple": {
            "app_id": "425226754",
            "country": "us",
        },
        "google": {
            "package": "com.univision.android",
            "lang": "en",
            "country": "us",
        },
    },
    {
        "app_name": "Univision Now",
        "apple": {
            "app_id": "1049321283",
            "country": "us",
        },
        "google": {
            "package": "com.univision.univisionnow",
            "lang": "en",
            "country": "us",
        },
    },
    {
        "app_name": "Canela.TV",
        "apple": {
            "app_id": "1507429168",
            "country": "us",
        },
        "google": {
            "package": "com.canela.ott",
            "lang": "en",
            "country": "us",
        },
    },
    {
        "app_name": "Cignal Play",
        "apple": {
            "app_id": "1293561677",
            "country": "ph",
        },
        "google": {
            "package": "tv.cignal.cignalplay",
            "lang": "en",
            "country": "ph",
        },
    },
]


# ---------- HELPERS: APPLE STORE ----------

def fetch_apple_app_info(app_id: str, country: str = "us") -> dict:
    """
    Use Apple iTunes Lookup API:
    https://itunes.apple.com/lookup?id=APP_ID&country=COUNTRY
    Returns summary info including averageUserRating & userRatingCount (if present).
    """
    url = "https://itunes.apple.com/lookup"
    params = {"id": app_id, "country": country}
    resp = requests.get(url, params=params, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    if data.get("resultCount", 0) == 0:
        return {"error": f"No lookup results for app_id={app_id} country={country}"}
    # Usually first result is the app
    app_info = data["results"][0]
    return {
        "raw": app_info,
        "average_rating": app_info.get("averageUserRating"),
        "rating_count": app_info.get("userRatingCount"),
        "version": app_info.get("version"),
        "current_version_release_date": app_info.get("currentVersionReleaseDate"),
        "track_name": app_info.get("trackName"),
        "bundle_id": app_info.get("bundleId"),
    }


def fetch_apple_reviews(app_id: str, country: str = "us", max_reviews: int = 50) -> list[dict]:
    """
    Fetch latest reviews via Apple RSS customer reviews (JSON).
    Endpoint pattern (page 1, most recent):
      https://itunes.apple.com/rss/customerreviews/page=1/id={id}/sortBy=mostRecent/json?cc={country}
    """
    base_url = (
        f"https://itunes.apple.com/rss/customerreviews/page=1/id={app_id}"
        f"/sortBy=mostRecent/json"
    )
    params = {"cc": country}
    try:
        resp = requests.get(base_url, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        return [{"error": f"apple_reviews_fetch_failed: {e}"}]

    entries = data.get("feed", {}).get("entry", [])
    reviews = []
    # First entry is usually app metadata, skip it
    for entry in entries[1:max_reviews + 1]:
        try:
            rating = int(entry.get("im:rating", {}).get("label"))
        except Exception:
            rating = None
        reviews.append(
            {
                "author": entry.get("author", {})
                .get("name", {})
                .get("label"),
                "title": entry.get("title", {}).get("label"),
                "text": entry.get("content", {}).get("label"),
                "rating": rating,
                "updated": entry.get("updated", {}).get("label"),
                "platform": "iOS",
                "store": "apple",
            }
        )
    return reviews


# ---------- HELPERS: GOOGLE PLAY ----------

def fetch_google_app_info(package: str, lang: str = "en", country: str = "us") -> dict:
    """
    Use google_play_scraper.app() to get summary:
      score, ratings count, etc.
    """
    try:
        info = gp_app(package, lang=lang, country=country)
    except Exception as e:
        return {"error": f"google_app_fetch_failed: {e}"}

    return {
        "raw": info,
        "average_rating": info.get("score"),
        "rating_count": info.get("ratings"),
        "version": info.get("version"),
        "installs": info.get("installs"),
        "title": info.get("title"),
        "developer": info.get("developer"),
    }


def fetch_google_reviews(
    package: str,
    lang: str = "en",
    country: str = "us",
    max_reviews: int = 50,
) -> list[dict]:
    """
    Fetch most recent reviews from Google Play via google_play_scraper.reviews().
    """
    all_reviews = []
    try:
        # reviews() returns (reviews_list, token); we'll loop until we have enough
        token = None
        while len(all_reviews) < max_reviews:
            batch, token = gp_reviews(
                package,
                lang=lang,
                country=country,
                sort=GP_Sort.NEWEST,
                count=min(100, max_reviews - len(all_reviews)),
                continuation_token=token,
            )
            all_reviews.extend(batch)
            if not token:
                break
            # be nice, avoid hammering
            time.sleep(0.5)
    except Exception as e:
        return [{"error": f"google_reviews_fetch_failed: {e}"}]

    result = []
    for r in all_reviews[:max_reviews]:
        result.append(
            {
                "author": r.get("userName"),
                "title": r.get("reviewCreatedVersion") or "",
                "text": r.get("content"),
                "rating": r.get("score"),
                "updated": (
                    r.get("at").isoformat()
                    if hasattr(r.get("at"), "isoformat")
                    else None
                ),
                "platform": "Android",
                "store": "google_play",
            }
        )
    return result


# ---------- MAIN PIPELINE ----------

def collect_store_data(max_reviews_per_store: int = 50) -> dict:
    """
    Collects ratings + recent reviews for all configured apps
    from Apple App Store + Google Play.
    Returns a dict ready to dump as JSON.
    """
    now_utc = datetime.now(timezone.utc).isoformat()

    apps_output = []

    for app_cfg in APPS:
        name = app_cfg["app_name"]
        apple_cfg = app_cfg.get("apple")
        google_cfg = app_cfg.get("google")

        print(f"[INFO] Collecting data for {name}…")

        # Apple
        apple_summary = None
        apple_reviews = []
        if apple_cfg:
            apple_summary = fetch_apple_app_info(
                app_id=apple_cfg["app_id"],
                country=apple_cfg.get("country", "us"),
            )
            apple_reviews = fetch_apple_reviews(
                app_id=apple_cfg["app_id"],
                country=apple_cfg.get("country", "us"),
                max_reviews=max_reviews_per_store,
            )

        # Google Play
        google_summary = None
        google_reviews = []
        if google_cfg:
            google_summary = fetch_google_app_info(
                package=google_cfg["package"],
                lang=google_cfg.get("lang", "en"),
                country=google_cfg.get("country", "us"),
            )
            google_reviews = fetch_google_reviews(
                package=google_cfg["package"],
                lang=google_cfg.get("lang", "en"),
                country=google_cfg.get("country", "us"),
                max_reviews=max_reviews_per_store,
            )

        apps_output.append(
            {
                "app_name": name,
                "apple": {
                    "app_id": apple_cfg["app_id"] if apple_cfg else None,
                    "country": apple_cfg.get("country") if apple_cfg else None,
                    "summary": apple_summary,
                    "reviews": apple_reviews,
                },
                "google": {
                    "package": google_cfg["package"] if google_cfg else None,
                    "country": google_cfg.get("country") if google_cfg else None,
                    "summary": google_summary,
                    "reviews": google_reviews,
                },
            }
        )

    return {
        "generated_utc": now_utc,
        "apps": apps_output,
    }


def main():
    data = collect_store_data(max_reviews_per_store=50)
    # Write to file used by your further pipeline (e.g., sentiment, dashboard)
    output_file = "store_data_raw.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"[INFO] Wrote store data to {output_file}")


if __name__ == "__main__":
    main()
