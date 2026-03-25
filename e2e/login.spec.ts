import { expect, test, type Page, type Route } from "@playwright/test";

const supabaseUrl = "https://supabase.test";

async function fulfillJson(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function mockPasswordLoginError(page: Page, message: string) {
  await page.route("**/auth/v1/token?grant_type=password*", async (route) => {
    const payload = route.request().postDataJSON();

    expect(payload).toMatchObject({
      email: "demo@example.com",
      password: "secret123",
    });

    await fulfillJson(route, 400, {
      error: "invalid_grant",
      error_description: message,
      error_code: "invalid_credentials",
    });
  });
}

async function mockSignupSuccess(page: Page) {
  await page.route("**/auth/v1/signup*", async (route) => {
    const payload = route.request().postDataJSON();

    expect(payload).toMatchObject({
      email: "demo@example.com",
      password: "secret123",
    });

    await fulfillJson(route, 200, {
      id: "user_signup_1",
      email: "demo@example.com",
      aud: "authenticated",
      role: "authenticated",
    });
  });
}

test("shows an auth error when password login fails", async ({ page }) => {
  await mockPasswordLoginError(page, "邮箱或密码错误");

  await page.goto("/login");
  await page.getByPlaceholder("邮箱").fill("demo@example.com");
  await page.getByPlaceholder("密码").fill("secret123");
  await page.getByRole("button", { name: "登录", exact: true }).click();

  await expect(page.getByText("邮箱或密码错误")).toBeVisible();
});

test("shows the signup confirmation after a successful registration", async ({ page }) => {
  await mockSignupSuccess(page);

  await page.goto("/login");
  await page.getByRole("button", { name: "注册" }).click();
  await page.getByPlaceholder("邮箱").fill("demo@example.com");
  await page.getByPlaceholder("密码").fill("secret123");
  await page.getByRole("button", { name: "注册" }).click();

  await expect(
    page.getByText("注册成功！请前往邮箱点击验证链接后再登录。")
  ).toBeVisible();
});
