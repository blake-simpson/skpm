export const getPublishToken = (): string => {
  const token = process.env.SKPM_PUBLISH_TOKEN?.trim();
  if (!token) {
    throw new Error("Missing SKPM_PUBLISH_TOKEN environment variable.");
  }
  return token;
};

export const validateBearerToken = (authorizationHeader: string | null): boolean => {
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return false;
  }
  const token = authorizationHeader.slice("Bearer ".length).trim();
  if (!token) {
    return false;
  }
  return token === getPublishToken();
};
