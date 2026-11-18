export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9_]{3,24}$/.test(username.trim());
}

export function validateRegistrationInput(input: {
  name: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}): string | null {
  if (input.name.trim().length < 2) {
    return 'Informe seu nome completo (mínimo 2 caracteres).';
  }
  if (!isValidUsername(input.username)) {
    return 'Nome de usuário deve ter 3 a 24 caracteres (letras, números ou _).';
  }
  if (!isValidEmail(input.email)) {
    return 'Informe um e-mail válido.';
  }
  if (input.password.length < 8) {
    return 'A senha deve ter no mínimo 8 caracteres.';
  }
  if (input.password !== input.confirmPassword) {
    return 'A confirmação de senha não confere.';
  }
  return null;
}

export function isValidHexColor(color: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(color.trim());
}
