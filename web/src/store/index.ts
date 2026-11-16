import { configureStore } from "@reduxjs/toolkit";
import { baseApi } from "@/infrastructure/api/baseApi";
import { errorToastMiddleware } from "@/infrastructure/api/errorToastMiddleware";
import authReducer from "./authSlice";
import appReducer from "./appSlice";
import docsReducer from "./docsSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    app: appReducer,
    docs: docsReducer,
    [baseApi.reducerPath]: baseApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(baseApi.middleware, errorToastMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
