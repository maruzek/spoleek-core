import {
  DEFAULT_SERVER_ERROR_MESSAGE,
  createSafeActionClient,
} from "next-safe-action";
import { z } from "zod";

const metadataSchema = z.object({
  actionName: z.string(),
});

export const actionClient = createSafeActionClient({
  defineMetadataSchema() {
    return metadataSchema;
  },
  handleServerError(error) {
    console.error("Safe action error", error);
    return error instanceof Error
      ? error.message
      : DEFAULT_SERVER_ERROR_MESSAGE;
  },
});
