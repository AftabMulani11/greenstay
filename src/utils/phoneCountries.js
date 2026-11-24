import { getCountries, getCountryCallingCode } from "libphonenumber-js/min";

const regionNames = typeof Intl.DisplayNames === "function"
  ? new Intl.DisplayNames(["en"], { type: "region" })
  : null;

export const phoneCountries = getCountries()
  .map(country => {
    const code = `+${getCountryCallingCode(country)}`;
    return {
      value: country,
      label: `${regionNames?.of(country) ?? country} (${code})`,
      shortLabel: `${country} ${code}`,
      code,
    };
  })
  .sort((first, second) => first.label.localeCompare(second.label));
