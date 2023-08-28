const __glob = () => {
  const chunk = "foo.js"
  require("./chunks/" + chunk);
  throw new Error("__glob go poof");
};

__glob();