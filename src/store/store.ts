import { useDispatch, useSelector } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { dogtagApi } from "../services/dogtagApi";
import authReducer from "./authSlice";

export const setupStore = () => {
  const store = configureStore({
    reducer: {
      auth: authReducer,
      [dogtagApi.reducerPath]: dogtagApi.reducer,
    },
    // Adding the api middleware enables caching, invalidation, polling,
    // and other useful features of `rtk-query`.
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: {
          ignoredActions: [
            "dogtagApi/executeQuery/fulfilled",
            "dogtagApi/executeMutation/fulfilled",
          ],
          ignoredPaths: ["dogtagApi"],
        },
      }).concat(dogtagApi.middleware),
  });

  // Optional, but required for refetchOnFocus/refetchOnReconnect behaviors
  setupListeners(store.dispatch);
  return store;
};

const store = setupStore();
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
export default store;
