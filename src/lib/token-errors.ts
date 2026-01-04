/**
 * Utility functions for handling token-related errors
 */

// Check if an error message indicates a token-related issue
export function isTokenError(message: string): boolean {
  const tokenErrorPatterns = [
    "Token has expired",
    "Please provide a new token",
    "Login failed",
    "Invalid token",
    "Session expired",
    "NO_TOKEN_FOUND",
    "No token found",
    "authentication token",
    "check your username and password",
    "Failed to decrypt stored token",
  ];
  return tokenErrorPatterns.some(pattern =>
    message.toLowerCase().includes(pattern.toLowerCase())
  );
}