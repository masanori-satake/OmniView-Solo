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

            # Simulating chrome.i18n placeholder parsing to correctly handle $$ escape and adjacent placeholders
            vars_found = set()
            idx = 0
            msg_len = len(message)
            while idx < msg_len:
                if message[idx] == '$':
                    if idx + 1 < msg_len and message[idx+1] == '$':
                        idx += 2
                    else:
                        j = idx + 1
                        while j < msg_len and message[j] != '$':
                            j += 1
                        if j < msg_len:
                            var_name = message[idx+1:j]
                            if var_name and all(c.isalnum() or c == '_' for c in var_name):
                                vars_found.add(var_name)
                            idx = j + 1
                        else:
                            idx += 1
                else:
                    idx += 1

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
