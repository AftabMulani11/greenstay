import { useState, useEffect } from "react";

/**
 * Custom Hook: useCountries
 * Fetches list of countries from the restcountries API for the phone number dropdown.
 * * Returns:
 * - countries: Array of country objects containing name, code, flag URL, etc.
 * - loading: Boolean indicating if data is still fetching.
 */
export const useCountries = () => {
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch specific fields to minimize payload size
    fetch("https://restcountries.com/v3.1/all?fields=name,idd,flags,cca2")
      .then((res) => res.json())
      .then((data) => {
        const formatted = data
          .filter((c) => c.idd?.root) // Filter out entries with missing calling codes
          .map((c) => {
            // Handle root/suffix logic for calling codes (e.g., +1 for US/Canada)
            const suffix = c.idd.suffixes?.length === 1 ? c.idd.suffixes[0] : "";
            const code = c.idd.root + suffix;
            
            return {
              name: c.name.common,
              code: code,
              flagUrl: c.flags.svg,
              cca2: c.cca2,
              key: c.cca2 
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));
        
        setCountries(formatted);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch countries", err);
        setLoading(false);
      });
  }, []);

  return { countries, loading };
};