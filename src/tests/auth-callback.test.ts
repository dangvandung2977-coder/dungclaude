import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/auth/callback/route";

// Mock Supabase Server Client
const mockExchangeCodeForSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockImplementation(async () => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
    },
  })),
}));

// Mock Database & Auth methods
const mockFindUserByEmail = vi.fn();
const mockEnsureAdminRole = vi.fn();
const mockSignSession = vi.fn().mockResolvedValue("mock_jwt_token");
const mockSetSessionCookie = vi.fn().mockReturnValue({
  name: "lumen_session",
  value: "mock_jwt_token",
  options: { path: "/", httpOnly: true },
});

vi.mock("@/lib/auth/auth", () => ({
  findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
  countAdmins: vi.fn().mockResolvedValue(1),
  hashPassword: vi.fn().mockResolvedValue("mock_hashed_pw"),
  ensureAdminRole: (...args: unknown[]) => mockEnsureAdminRole(...args),
  signSession: (...args: unknown[]) => mockSignSession(...args),
  setSessionCookie: (...args: unknown[]) => mockSetSessionCookie(...args),
}));

const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
vi.mock("@/lib/db/supabase", () => ({
  getSupabase: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      insert: (...args: unknown[]) => mockInsert(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    }),
  }),
}));

describe("OAuth Callback Route (/auth/callback)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to login with error message when provider returns error", async () => {
    const req = new Request("http://localhost:3000/auth/callback?error=access_denied&error_description=User%20cancelled");
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/login");
    expect(location).toContain("error=User%20cancelled");
  });

  it("redirects to login when no code is supplied", async () => {
    const req = new Request("http://localhost:3000/auth/callback");
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/login");
    expect(location).toContain("M%C3%A3%20x%C3%A1c%20th%E1%BB%B1c");
  });

  it("exchanges code, syncs user profile, sets session cookie and redirects to /app", async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({
      data: {
        user: {
          id: "google_user_123",
          email: "alex@example.com",
          user_metadata: { full_name: "Alex Smith" },
        },
      },
      error: null,
    });

    mockFindUserByEmail.mockResolvedValueOnce(null); // First time user

    const req = new Request("http://localhost:3000/auth/callback?code=valid_oauth_code");
    const res = await GET(req);

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith("valid_oauth_code");
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "google_user_123",
        email: "alex@example.com",
        name: "Alex Smith",
        role: "user",
      })
    );
    expect(mockSignSession).toHaveBeenCalledWith({
      id: "google_user_123",
      email: "alex@example.com",
      name: "Alex Smith",
      role: "user",
    });

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toBe("http://localhost:3000/app");
    expect(res.cookies.get("lumen_session")?.value).toBe("mock_jwt_token");
  });

  it("handles existing user by email without creating duplicate record", async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({
      data: {
        user: {
          id: "google_user_999",
          email: "existing@example.com",
          user_metadata: { full_name: "Existing User" },
        },
      },
      error: null,
    });

    mockFindUserByEmail.mockResolvedValueOnce({
      id: "user_pre_existing_id",
      email: "existing@example.com",
      name: "Existing User",
      role: "admin",
      passwordHash: "hash",
    });

    const req = new Request("http://localhost:3000/auth/callback?code=valid_oauth_code");
    const res = await GET(req);

    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockSignSession).toHaveBeenCalledWith({
      id: "user_pre_existing_id",
      email: "existing@example.com",
      name: "Existing User",
      role: "admin",
    });

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/app");
  });
});
