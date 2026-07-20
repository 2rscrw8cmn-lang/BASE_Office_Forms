import { routeV2Request } from "../../../src/http/v2/router";
import { createV2RouteDependencies } from "../../../src/http/v2/dependencies";

export const onRequest: PagesFunction<Env, "path"> = (context) =>
  routeV2Request(context.request, createV2RouteDependencies(context.env));
