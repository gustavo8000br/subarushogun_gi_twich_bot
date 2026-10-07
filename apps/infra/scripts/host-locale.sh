#!/bin/sh

load_product_locale() {
  locale_root=$1
  PRODUCT_LOCALE=pt-BR
  locale_state="$locale_root/.local/product-locale.state"
  if [ -r "$locale_state" ]; then
    IFS= read -r locale_line < "$locale_state" || locale_line=''
    case "$locale_line" in
      locale=*)
        locale_candidate=${locale_line#locale=}
        case "$locale_candidate" in
          ''|*[!A-Za-z0-9-]*) ;;
          *)
            if [ -r "$locale_root/apps/web/localization/catalogs/lifecycle/$locale_candidate.tsv" ]; then
              PRODUCT_LOCALE=$locale_candidate
            fi
            ;;
        esac
        ;;
    esac
  fi
}

product_copy() {
  locale_root=$1
  copy_key=$2
  fallback_text=$3
  for locale_candidate in "$PRODUCT_LOCALE" pt-BR; do
    catalog_path="$locale_root/apps/web/localization/catalogs/lifecycle/$locale_candidate.tsv"
    if [ -r "$catalog_path" ]; then
      localized_text=$(awk -F '\t' -v key="$copy_key" '$1 == key { sub(/^[^\t]*\t/, ""); print; found=1; exit } END { if (!found) exit 1 }' "$catalog_path" 2>/dev/null) || localized_text=''
      if [ -n "$localized_text" ]; then
        printf '%s\n' "$localized_text"
        return 0
      fi
    fi
  done
  printf '%s\n' "$fallback_text"
}

product_copy_with_word() {
  locale_root=$1
  copy_key=$2
  fallback_text=$3
  word_value=$4
  localized_text=$(product_copy "$locale_root" "$copy_key" "$fallback_text")
  printf '%s\n' "$localized_text" | awk -v word="$word_value" '{ marker = index($0, "{word}"); if (marker) print substr($0, 1, marker - 1) word substr($0, marker + 6); else print $0 }'
}
