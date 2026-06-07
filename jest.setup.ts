import '@testing-library/jest-dom'

global.Request = class Request {
  url: string
  method: string
  headers: Headers
  body: ReadableStream | null
  private _bodyText: string

  constructor(input: string, init?: RequestInit) {
    this.url = input
    this.method = init?.method || 'GET'
    this.headers = new Headers(init?.headers)
    this._bodyText = init?.body as string || ''
    this.body = null
  }

  async json() {
    return JSON.parse(this._bodyText)
  }

  async text() {
    return this._bodyText
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

global.Headers = class Headers {
  private _headers: Record<string, string> = {}

  constructor(init?: HeadersInit) {
    if (init) {
      if (Array.isArray(init)) {
        init.forEach(([key, value]) => {
          this._headers[key.toLowerCase()] = value
        })
      } else if (init instanceof Headers) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Object.assign(this._headers, (init as any)._headers)
      } else {
        Object.entries(init).forEach(([key, value]) => {
          this._headers[key.toLowerCase()] = value
        })
      }
    }
  }

  get(name: string) {
    return this._headers[name.toLowerCase()] || null
  }

  set(name: string, value: string) {
    this._headers[name.toLowerCase()] = value
  }

  has(name: string) {
    return name.toLowerCase() in this._headers
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any
