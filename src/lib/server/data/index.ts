import { requireDataContext } from "./context";
import { createDataClient } from "./query";

export function getDataClient() {
  return createDataClient(requireDataContext());
}

export { createDataClient } from "./query";
export { runWithDataContext, getDataContext } from "./context";
export type {
  DataClient,
  DataContext,
  AuthUser,
  AuthSession,
  QueryError,
} from "./types";
