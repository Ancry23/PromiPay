import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthContext } from "../auth/AuthContext";
import Login from "./Login";

function renderLogin(overrides = {}) {
  const auth = {
    user: null,
    login: vi.fn().mockResolvedValue(undefined),
    register: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    </AuthContext.Provider>
  );
  return auth;
}

describe("Login", () => {
  it("validates required fields before calling the API", async () => {
    const auth = renderLogin();
    await userEvent.click(screen.getByRole("button", { name: "Accedi" }));
    expect(screen.getByText("Inserisci username e password.")).toBeInTheDocument();
    expect(auth.login).not.toHaveBeenCalled();
  });

  it("logs in with trimmed username", async () => {
    const auth = renderLogin();
    await userEvent.type(screen.getByLabelText("Username"), "  mario ");
    await userEvent.type(screen.getByLabelText("Password"), "segreta");
    await userEvent.click(screen.getByRole("button", { name: "Accedi" }));
    expect(auth.login).toHaveBeenCalledWith("mario", "segreta");
  });

  it("shows a friendly message on wrong credentials", async () => {
    renderLogin({ login: vi.fn().mockRejectedValue({ response: { status: 401 } }) });
    await userEvent.type(screen.getByLabelText("Username"), "mario");
    await userEvent.type(screen.getByLabelText("Password"), "sbagliata");
    await userEvent.click(screen.getByRole("button", { name: "Accedi" }));
    expect(await screen.findByText("Credenziali non valide.")).toBeInTheDocument();
  });

  it("switches to registration and password recovery", async () => {
    renderLogin();
    await userEvent.click(screen.getByRole("button", { name: "Nuovo utente? Registrati" }));
    expect(screen.getByRole("heading", { name: "Crea un account" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Torna all'accesso" }));
    await userEvent.click(screen.getByRole("button", { name: "Password dimenticata?" }));
    expect(screen.getByRole("heading", { name: "Password dimenticata" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });
});
