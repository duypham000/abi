import { configureStore } from "@reduxjs/toolkit";
import { baseApi } from "@/infrastructure/api/baseApi";
import { errorToastMiddleware } from "@/infrastructure/api/errorToastMiddleware";
import { cacheMiddleware, mutationCacheMiddleware } from "@/infrastructure/api/cacheMiddleware";
import authReducer from "./authSlice";
import appReducer from "./appSlice";
import docsReducer from "./docsSlice";

import settingsReducer from "./settingsSlice";
import conflictsReducer from "./conflictsSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    app: appReducer,
    docs: docsReducer,

    settings: settingsReducer,
    conflicts: conflictsReducer,
    [baseApi.reducerPath]: baseApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      baseApi.middleware,
      errorToastMiddleware,
      cacheMiddleware,
      mutationCacheMiddleware,
    ),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
