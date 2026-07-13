/** Locales served by a delivery area, from a codegen `DELIVERY_ARTIFACTS`-shaped map. */
export type LocalesForDeliveryArea<
  Artifacts extends Record<string, readonly string[]>,
  Area extends keyof Artifacts & string,
> = Artifacts[Area][number];

/** Map from delivery area to locale lists; empty when custom delivery is not configured. */
export type DeliveryArtifactsMap<
  RequestLocales extends string,
  DeliveryArea extends string,
> = DeliveryArea extends never
  ? Record<string, never>
  : Record<DeliveryArea, readonly RequestLocales[]>;

/** When a delivery-area map is configured, resolve partition locales; otherwise keep the full pool. */
export type LocalesForDeliveryAreaOrAll<
  RequestLocales extends string,
  DeliveryArea extends string,
  DeliveryArtifacts extends DeliveryArtifactsMap<RequestLocales, DeliveryArea>,
  Area extends string,
> = DeliveryArea extends never
  ? RequestLocales
  : Area extends DeliveryArea
    ? DeliveryArtifacts[Area][number]
    : never;
