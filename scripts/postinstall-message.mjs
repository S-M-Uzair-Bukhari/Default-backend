const lines = [
  "",
  "Default Backend setup complete.",
  "",
  "Next steps:",
  "  1. node create-backend.mjs --help",
  "  2. node create-backend.mjs <project-name>",
  "",
  "Examples:",
  "  node create-backend.mjs my-api",
  "  node create-backend.mjs my-api --modules user,post --db mongo",
  "  node create-backend.mjs my-api --ts --modules user,post --db postgres --cicd",
  "",
];

for (const line of lines) {
  console.log(line);
}
