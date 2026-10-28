import { describe, expect, it } from "vitest";
import { getVenueAddressLines, getVenueDirectionsUrl } from "@/lib/venueAddress";

describe("getVenueAddressLines", () => {
  it("splits an address that already ends in town and postcode instead of repeating them", () => {
    expect(getVenueAddressLines({ address: "233 Shoreditch High St, London E1 6PJ", city: "London", postcode: "E1 6PJ" })).toEqual({ street: "233 Shoreditch High St", locality: "London E1 6PJ" });
  });

  it("keeps the address's own town when it differs from the city", () => {
    expect(getVenueAddressLines({ address: "118 High St, Newport Pagnell MK16 8EH", city: "Milton Keynes", postcode: "MK16 8EH" })).toEqual({ street: "118 High St", locality: "Newport Pagnell MK16 8EH" });
  });

  it("matches the postcode regardless of spacing and case", () => {
    expect(getVenueAddressLines({ address: "1-2 Mill Ln, Cardiff cf101fl", city: "Cardiff", postcode: "CF10 1FL" }).street).toBe("1-2 Mill Ln");
  });

  it("appends city and postcode when the address is only the street", () => {
    expect(getVenueAddressLines({ address: "198 Mauldeth Road", city: "Manchester", postcode: "M19 1AJ" })).toEqual({ street: "198 Mauldeth Road", locality: "Manchester M19 1AJ" });
  });

  it("returns no street when the address is only town and postcode", () => {
    expect(getVenueAddressLines({ address: "Bristol BS1 2LE", city: "Bristol", postcode: "BS1 2LE" })).toEqual({ street: "", locality: "Bristol BS1 2LE" });
  });

  it("drops a trailing country", () => {
    expect(getVenueAddressLines({ address: "11 Bermondsey Sq, London SE1 3UN, United Kingdom", city: "London", postcode: "SE1 3UN" })).toEqual({ street: "11 Bermondsey Sq", locality: "London SE1 3UN" });
  });
});

describe("getVenueDirectionsUrl", () => {
  it("routes to the venue's coordinates", () => {
    expect(getVenueDirectionsUrl({ name: "Layali", address: "1 St", postcode: "E1 6PJ", latitude: 51.5, longitude: -0.07 })).toBe("https://www.google.com/maps/dir/?api=1&destination=51.5%2C-0.07");
  });
});
