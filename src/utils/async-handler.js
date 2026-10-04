const asyncHandler = (requestHandler) => {
  // high order function -- returns a function
  return (req, res, next) => {
    Promise.resolve(requestHandler(req, res, next)).catch((err) => next(err));
  };
};

export { asyncHandler };
