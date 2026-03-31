import { test, expect } from '@playwright/test'

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('renders all required elements', async ({ page }) => {
    await expect(page.getByText('Welcome back')).toBeVisible()
    await expect(page.getByText('Good to see you again')).toBeVisible()
    await expect(page.getByLabel('Email address')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Forgot password?' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Google/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Apple/i })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Create account' })).toBeVisible()
  })

  test('shows validation errors when form submitted empty', async ({ page }) => {
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByText('Email address is required')).toBeVisible()
    await expect(page.getByText('Password is required')).toBeVisible()
  })

  test('shows error for invalid email format', async ({ page }) => {
    await page.getByLabel('Email address').fill('notanemail')
    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByText('Please enter a valid email address')).toBeVisible()
  })

  test('Forgot password link navigates to forgot password page', async ({ page }) => {
    await page.getByRole('link', { name: 'Forgot password?' }).click()
    await expect(page).toHaveURL('/forgot-password')
  })

  test('Create account link navigates to register page', async ({ page }) => {
    await page.getByRole('link', { name: 'Create account' }).click()
    await expect(page).toHaveURL('/register')
  })
})
