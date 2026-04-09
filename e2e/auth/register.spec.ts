import { test, expect } from '@playwright/test'

test.describe('Register page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register')
  })

  test('renders all required elements', async ({ page }) => {
    await expect(page.getByText('Create your account')).toBeVisible()
    await expect(page.getByText('Join coaches and players across the UK')).toBeVisible()
    await expect(page.getByLabel('Full name')).toBeVisible()
    await expect(page.getByLabel('Email address')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Google/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Apple/i })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible()
  })

  test('shows validation errors when form submitted empty', async ({ page }) => {
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText('Full name is required')).toBeVisible()
    await expect(page.getByText('Email address is required')).toBeVisible()
    await expect(page.getByText('Password is required')).toBeVisible()
  })

  test('shows email validation error for invalid email', async ({ page }) => {
    await page.getByLabel('Full name').fill('Test User')
    await page.getByLabel('Email address').fill('notanemail')
    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText('Please enter a valid email address')).toBeVisible()
  })

  test('shows password length error for short password', async ({ page }) => {
    await page.getByLabel('Full name').fill('Test User')
    await page.getByLabel('Email address').fill('test@example.com')
    await page.getByLabel('Password').fill('short')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText('Password must be at least 8 characters')).toBeVisible()
  })

  test('Log in link navigates to login page', async ({ page }) => {
    await page.getByRole('link', { name: 'Log in' }).click()
    await expect(page).toHaveURL('/login')
  })

  test('crikly logo links to homepage', async ({ page }) => {
    await page.getByRole('link', { name: /crikly/i }).click()
    await expect(page).toHaveURL('/')
  })
})
