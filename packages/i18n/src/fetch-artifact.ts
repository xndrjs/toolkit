/**
 * Identifies a delivery JSON artifact. Codegen passes this to {@link FetchArtifact};
 * URL / filesystem mapping is an application concern.
 */
export type DeliveryResourceId = {
  locale: string;
  namespace: string;
  /** Present for `delivery: "custom"` (partition key is the area). */
  area?: string;
};

/**
 * Loads a translation JSON artifact by resource id.
 * Must return the parsed JSON value (not a raw Response).
 */
export type FetchArtifact = (id: DeliveryResourceId) => Promise<unknown>;
