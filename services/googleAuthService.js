import { OAuth2Client } from "google-auth-library";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

console.log("Google OAuth configuration:");
console.log("GOOGLE_CLIENT_ID:", clientId);
console.log(
  "GOOGLE_CLIENT_SECRET exists:",
  Boolean(clientSecret)
);

if (!clientId) {
  throw new Error("GOOGLE_CLIENT_ID is missing");
}

if (!clientSecret) {
  throw new Error("GOOGLE_CLIENT_SECRET is missing");
}

const googleClient = new OAuth2Client(
  clientId,
  clientSecret,
  "postmessage"
);

const verifyGoogleCode = async (code) => {
  try {
    if (!code) {
      throw new Error(
        "Google authorization code is required"
      );
    }

    console.log(
      "Exchanging Google authorization code..."
    );

    const { tokens } =
      await googleClient.getToken(code);

    console.log(
      "Google token response received."
    );

    if (!tokens.id_token) {
      console.error(
        "Google did not return an ID token:",
        tokens
      );

      throw new Error(
        "Google ID token was not returned"
      );
    }

    const ticket =
      await googleClient.verifyIdToken({
        idToken: tokens.id_token,
        audience: clientId,
      });

    const payload = ticket.getPayload();

    if (!payload) {
      throw new Error(
        "Google token payload is missing"
      );
    }

    console.log(
      "Google user verified:",
      {
        googleId: payload.sub,
        email: payload.email,
        emailVerified: payload.email_verified,
        name: payload.name,
      }
    );

    return payload;
  } catch (error) {
    console.error(
      "Google code verification error:"
    );

    console.error(
      "Message:",
      error.message
    );

    console.error(
      "Response:",
      error.response?.data
    );

    throw new Error(
      error.response?.data?.error_description ||
      error.message ||
      "Google authentication failed"
    );
  }
};

export default verifyGoogleCode;