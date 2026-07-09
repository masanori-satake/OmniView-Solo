import json
import os
import re
import sys

def check_messages():
    locales_dir = "projects/app/_locales"
    if not os.path.isdir(locales_dir):
        print(f"Error: {locales_dir} is not a directory.")
        return False

    success = True
    langs = [d for d in os.listdir(locales_dir) if os.path.isdir(os.path.join(locales_dir, d))]

    for lang in langs:
        messages_path = os.path.join(locales_dir, lang, "messages.json")
        if not os.path.isfile(messages_path):
            continue

        try:
            with open(messages_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            print(f"Error: Failed to parse JSON in {messages_path}: {e}")
            success = False
            continue

        for key, val in data.items():
            if not isinstance(val, dict):
                print(f"Error: {messages_path} key '{key}' is not an object.")
                success = False
                continue

            message = val.get("message", "")
            placeholders = val.get("placeholders", {})

            # Find all variables enclosed by $ signs, e.g. $ID$ or $ERROR$
            # Note: chrome.i18n reserves $$ for a literal dollar sign, but we are looking for actual variable names.
            # Variables are represented as $[A-Za-z0-9_]+$.
            # Standard placeholders defined in messages.json are case-insensitive.
            vars_found = set(re.findall(r'\$([A-Za-z0-9_]+)\$', message))

            placeholder_keys = {pk.lower() for pk in placeholders.keys()} if isinstance(placeholders, dict) else set()

            for var in vars_found:
                if var.lower() not in placeholder_keys:
                    print(f"Error in {lang}/messages.json: Key '{key}' uses placeholder '${var}$' in the message, but it is not defined in 'placeholders'.")
                    success = False

            # Check for unused placeholders as well
            # Perform case-insensitive check to see if any form of the placeholder is used
            vars_found_lower = {v.lower() for v in vars_found}
            for pk in placeholder_keys:
                if pk not in vars_found_lower:
                    print(f"Error in {lang}/messages.json: Key '{key}' defines placeholder '{pk}' in 'placeholders', but it is not used in the message.")
                    success = False

    return success

if __name__ == "__main__":
    if not check_messages():
        print("Locale placeholders verification failed.")
        sys.exit(1)
    else:
        print("Locale placeholders verification passed.")
        sys.exit(0)
