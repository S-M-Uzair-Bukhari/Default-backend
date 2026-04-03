const lines = [
  "",
  "Default Backend setup complete.",
  "",
  "Next steps:",
  "  1. npm run create",
  "  2. npm run create -- my-api",
  "  3. After publishing, users can run: npm create default-backend",
  "",
  "Examples:",
  "  npm run create",
  "  npm run create -- my-api --modules user,post --db mongo",
  "  npm run create -- my-api --ts --modules user,post --db postgres --cicd",
  "  npx create-default-backend my-api",
  "",
];

for (const line of lines) {
  console.log(line);
}