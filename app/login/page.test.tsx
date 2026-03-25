import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LoginPage from "./page";

const unsubscribe = vi.fn();
const onAuthStateChange = vi.fn();
const signUp = vi.fn();
const signInWithPassword = vi.fn();
const signInWithOAuth = vi.fn();

vi.mock("../../lib/supabase-browser", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      onAuthStateChange,
      signUp,
      signInWithPassword,
      signInWithOAuth,
    },
  }),
}));

function fillCredentials(user: ReturnType<typeof userEvent.setup>) {
  return (async () => {
    await user.type(screen.getByPlaceholderText("邮箱"), "demo@example.com");
    await user.type(screen.getByPlaceholderText("密码"), "secret123");
  })();
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

describe("LoginPage", () => {
  beforeEach(() => {
    unsubscribe.mockReset();
    onAuthStateChange.mockReset();
    signUp.mockReset();
    signInWithPassword.mockReset();
    signInWithOAuth.mockReset();

    unsubscribe.mockReturnValue(undefined);
    onAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe,
        },
      },
    });
    signUp.mockResolvedValue({ error: null });
    signInWithPassword.mockResolvedValue({ error: null });
    signInWithOAuth.mockResolvedValue({ error: null });
  });

  it("renders login mode by default and toggles to sign up", async () => {
    const user = userEvent.setup();

    render(<LoginPage />);

    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(screen.getByText("没有账号？")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "注册" }));

    expect(screen.getByRole("button", { name: "注册" })).toBeInTheDocument();
    expect(screen.getByText("已有账号？")).toBeInTheDocument();
  });

  it("submits email login credentials", async () => {
    const user = userEvent.setup();

    render(<LoginPage />);
    await fillCredentials(user);

    await user.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(signInWithPassword).toHaveBeenCalledWith({
        email: "demo@example.com",
        password: "secret123",
      });
    });
  });

  it("shows a signup confirmation message after successful registration", async () => {
    const user = userEvent.setup();

    render(<LoginPage />);
    await user.click(screen.getByRole("button", { name: "注册" }));
    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "注册" }));

    await waitFor(() => {
      expect(signUp).toHaveBeenCalledWith({
        email: "demo@example.com",
        password: "secret123",
      });
    });
    expect(
      screen.getByText("注册成功！请前往邮箱点击验证链接后再登录。")
    ).toBeInTheDocument();
  });

  it("shows the Supabase error message when login fails", async () => {
    const user = userEvent.setup();
    signInWithPassword.mockResolvedValueOnce({
      error: { message: "邮箱或密码错误" },
    });

    render(<LoginPage />);
    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByText("邮箱或密码错误")).toBeInTheDocument();
  });

  it("disables actions while waiting for the login request", async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<{ error: null }>();
    signInWithPassword.mockReturnValueOnce(deferred.promise);

    render(<LoginPage />);
    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(screen.getByRole("button", { name: "登录" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "使用 Google 登录" })).toBeDisabled();

    deferred.resolve({ error: null });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "登录" })).not.toBeDisabled();
    });
  });

  it("starts Google OAuth with the current origin as redirect target", async () => {
    const user = userEvent.setup();

    render(<LoginPage />);
    await user.click(screen.getByRole("button", { name: "使用 Google 登录" }));

    await waitFor(() => {
      expect(signInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/`,
          queryParams: { prompt: "select_account" },
        },
      });
    });
  });
});
