import { test, expect } from '@playwright/test'

test.describe('Auth navigation flow', () => {
  test('homepage Get started button navigates to /register', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Get started' }).click()
    // AUTH-JOURNEY-01: /join retired; landing CTAs now go straight to /register.
    await expect(page).toHaveURL('/register')
  })

  test('homepage Log in link navigates to login', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Log in' }).click()
    await expect(page).toHaveURL('/login')
  })

  test('register page shows crikly branding', async ({ page }) => {
    await page.goto('/register')
    await expect(page.locator('text=crikly')).toBeVisible()
  })

  test('login page shows crikly branding', async ({ page }) => {
    await page.goto('/login')
    // PUB-03: AuthSplitShell renders both a "Crikly home" logo link and a
    // "Back to crikly.app" chrome link — narrow to the logo by its aria-label.
    await expect(page.getByRole('link', { name: 'Crikly home' })).toBeVisible()
  })

  test('forgot password page renders correctly', async ({ page }) => {
    await page.goto('/forgot-password')
    await expect(page.getByText('Reset your password')).toBeVisible()
    await expect(page.getByLabel('Email address')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Back to log in/i })).toBeVisible()
  })

  test('forgot password back link returns to login', async ({ page }) => {
    await page.goto('/forgot-password')
    await page.getByRole('link', { name: /Back to log in/i }).click()
    await expect(page).toHaveURL('/login')
  })

  test('verify page renders with email from query param', async ({ page }) => {
    await page.goto('/verify?email=test%40example.com')
    await expect(page.getByText('Check your inbox')).toBeVisible()
    await expect(page.getByText('test@example.com')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Resend email' })).toBeVisible()
  })

  test('protected routes redirect unauthenticated users to login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })
})
