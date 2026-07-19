import { routeV2Request } from "../../../src/http/v2/router";

export const onRequest: PagesFunction<Env, "path"> = (context) =>
  routeV2Request(context.request);
