import { z } from "zod";
import { GetCurrentAuthUserResponse } from "./generated/api";

export type AuthUser = NonNullable<z.infer<typeof GetCurrentAuthUserResponse>["user"]>;
