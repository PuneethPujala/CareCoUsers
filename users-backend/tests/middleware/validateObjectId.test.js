const { validateObjectId } = require("../../src/middleware/validateObjectId");

describe("validateObjectId Middleware", () => {
  let req, res, next;

  beforeEach(() => {
    req = { params: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
  });

  it("should call next if param is valid ObjectId", () => {
    req.params.id = "60c72b2f9b1d8e25d4814d4e";
    const middleware = validateObjectId("id");
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should call next if param is missing", () => {
    const middleware = validateObjectId("id");
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should return 400 if param is invalid ObjectId", () => {
    req.params.id = "invalid-id-123";
    const middleware = validateObjectId("id");
    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "Invalid resource identifier",
      code: "INVALID_ID",
    });
  });

  it("should support multiple parameters", () => {
    req.params.id1 = "60c72b2f9b1d8e25d4814d4e";
    req.params.id2 = "invalid-id";
    const middleware = validateObjectId("id1", "id2");
    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
