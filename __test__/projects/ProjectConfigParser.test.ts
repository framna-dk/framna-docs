import { ProjectConfigParser } from "@/features/projects/domain"

test("It parses an empty string", async () => {
  const sut = new ProjectConfigParser()
  const config = sut.parse("")
  expect(config).toEqual({})
})

test("It parses a string containing a name", async () => {
  const sut = new ProjectConfigParser()
  const config = sut.parse("name: Foo")
  expect(config).toEqual({name: "Foo"})
})

test("It parses a string containing an image", async () => {
  const sut = new ProjectConfigParser()
  const config = sut.parse("image: https://example.com/foo.png")
  expect(config).toEqual({image: "https://example.com/foo.png"})
})

test("It parses a string containing a name and an image", async () => {
  const sut = new ProjectConfigParser()
  const config = sut.parse(`
  name: Foo
  image: https://example.com/foo.png
  `)
  expect(config).toEqual({
    name: "Foo",
    image: "https://example.com/foo.png"
  })
})

test("It parses specifications with a path and a name", async () => {
  const sut = new ProjectConfigParser()
  const config = sut.parse(`
specifications:
  - path: services/user/openapi.yaml
    name: User Service API
`)
  expect(config).toEqual({
    specifications: [{ path: "services/user/openapi.yaml", name: "User Service API" }]
  })
})

test("It parses specifications with a path only (no name)", async () => {
  const sut = new ProjectConfigParser()
  const config = sut.parse(`
specifications:
  - path: services/user/openapi.yaml
`)
  expect(config).toEqual({
    specifications: [{ path: "services/user/openapi.yaml" }]
  })
})

test("It parses multiple specifications", async () => {
  const sut = new ProjectConfigParser()
  const config = sut.parse(`
specifications:
  - path: services/user/openapi.yaml
    name: User API
  - path: services/orders/openapi.yaml
`)
  expect(config).toEqual({
    specifications: [
      { path: "services/user/openapi.yaml", name: "User API" },
      { path: "services/orders/openapi.yaml" }
    ]
  })
})
