import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { AuthUser } from "src/auth/roles";

interface AuthState {
  user: AuthUser | null;
  status: "idle" | "loading" | "failed";
  error: string | null;
  checked: boolean;
}

const initialState: AuthState = {
  user: null,
  status: "idle",
  error: null,
  checked: false,
};

export const loginUser = createAsyncThunk(
  "auth/login",
  async (
    { username, password }: { username: string; password: string },
    { rejectWithValue },
  ) => {
    const res = await fetch("/webui/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      credentials: "include",
    });
    const data = await res.json();
    if (!res.ok) return rejectWithValue(data.error ?? "Login failed");
    return data as AuthUser;
  },
);

export const logoutUser = createAsyncThunk("auth/logout", async () => {
  await fetch("/webui/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
});

export const checkSession = createAsyncThunk(
  "auth/check",
  async (_, { rejectWithValue }) => {
    const res = await fetch("/webui/api/auth/me", {
      credentials: "include",
    });
    if (!res.ok) return rejectWithValue("Not authenticated");
    return (await res.json()) as AuthUser;
  },
);

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loginUser.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.status = "idle";
        state.user = action.payload;
        state.error = null;
        state.checked = true;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.status = "failed";
        state.error = (action.payload as string) ?? "Login failed";
        state.checked = true;
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.status = "idle";
        state.error = null;
      })
      .addCase(checkSession.fulfilled, (state, action) => {
        state.user = action.payload;
        state.checked = true;
      })
      .addCase(checkSession.rejected, (state) => {
        state.user = null;
        state.checked = true;
      });
  },
});

export default authSlice.reducer;
