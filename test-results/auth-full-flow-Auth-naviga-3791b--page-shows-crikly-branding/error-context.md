# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - generic [ref=e3]:
      - link "crikly" [ref=e4] [cursor=pointer]:
        - /url: /
      - heading "Welcome back" [level=1] [ref=e5]
      - paragraph [ref=e6]: Good to see you again
      - generic [ref=e7]:
        - generic [ref=e8]:
          - generic [ref=e9]: Email address
          - textbox "Email address" [ref=e10]:
            - /placeholder: you@example.com
        - generic [ref=e11]:
          - generic [ref=e12]:
            - generic [ref=e13]: Password
            - link "Forgot password?" [ref=e14] [cursor=pointer]:
              - /url: /forgot-password
          - textbox "Password" [ref=e15]:
            - /placeholder: Your password
        - button "Log in" [ref=e16] [cursor=pointer]
      - generic [ref=e19]: or continue with
      - generic [ref=e21]:
        - button "Continue with Google" [ref=e22] [cursor=pointer]:
          - img [ref=e23]
          - text: Google
        - button "Continue with Apple" [ref=e28] [cursor=pointer]:
          - img [ref=e29]
          - text: Apple
      - paragraph [ref=e31]:
        - text: New to Crikly?
        - link "Create account" [ref=e32] [cursor=pointer]:
          - /url: /register
  - button "Open Next.js Dev Tools" [ref=e38] [cursor=pointer]:
    - img [ref=e39]
  - alert [ref=e42]
```