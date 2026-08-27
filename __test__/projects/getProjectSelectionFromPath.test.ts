import { getProjectSelectionFromPath } from "@/features/projects/domain"

test("It selects the first project when there is only one project and path is empty", () => {
  const sut = getProjectSelectionFromPath({
    path: "",
    projects: [{
      id: "foo",
      name: "foo",
      displayName: "foo",
      versions: [{
        id: "bar",
        name: "bar",
        isDefault: false,
        specifications: [{
          id: "hello",
          name: "hello.yml",
          url: "https://example.com/hello.yml"
        }]
      }],
      owner: "acme",
      ownerUrl: "https://example.com/acme"
    }]
  })
  expect(sut.project!.owner).toEqual("acme")
  expect(sut.project!.name).toEqual("foo")
  expect(sut.version!.id).toEqual("bar")
  expect(sut.specification!.id).toEqual("hello")
})

test("It selects the first version and specification of the specified project", () => {
  const sut = getProjectSelectionFromPath({
    path: "/acme/bar",
    projects: [{
      id: "foo",
      name: "foo",
      displayName: "foo",
      versions: [],
      owner: "acme",
      ownerUrl: "https://example.com/acme"
    }, {
      id: "bar",
      name: "bar",
      displayName: "bar",
      versions: [{
        id: "baz1",
        name: "baz1",
        isDefault: false,
        specifications: [{
          id: "hello1",
          name: "hello1.yml",
          url: "https://example.com/hello.yml"
        }, {
          id: "hello2",
          name: "hello2.yml",
          url: "https://example.com/hello.yml"
        }]
      }, {
        id: "baz2",
        name: "baz2",
        isDefault: false,
        specifications: []
      }],
      owner: "acme",
      ownerUrl: "https://example.com/acme"
    }]
  })
  expect(sut.project!.owner).toEqual("acme")
  expect(sut.project!.name).toEqual("bar")
  expect(sut.version!.id).toEqual("baz1")
  expect(sut.specification!.id).toEqual("hello1")
})

test("It selects the first specification of the specified project and version", () => {
  const sut = getProjectSelectionFromPath({
    path: "/acme/bar/baz2",
    projects: [{
      id: "foo",
      name: "foo",
      displayName: "foo",
      versions: [],
      owner: "acme",
      ownerUrl: "https://example.com/acme"
    }, {
      id: "bar",
      name: "bar",
      displayName: "bar",
      versions: [{
        id: "baz1",
        name: "baz1",
        isDefault: false,
        specifications: []
      }, {
        id: "baz2",
        name: "baz2",
        isDefault: false,
        specifications: [{
          id: "hello1",
          name: "hello1.yml",
          url: "https://example.com/hello.yml"
        }]
      }],
      owner: "acme",
      ownerUrl: "https://example.com/acme"
    }]
  })
  expect(sut.project!.owner).toEqual("acme")
  expect(sut.project!.name).toEqual("bar")
  expect(sut.version!.id).toEqual("baz2")
  expect(sut.specification!.id).toEqual("hello1")
})

test("It selects the specification of the specified version", () => {
  const sut = getProjectSelectionFromPath({
    path: "/acme/bar/baz2",
    projects: [{
      id: "foo",
      name: "foo",
      displayName: "foo",
      versions: [],
      owner: "acme",
      ownerUrl: "https://example.com/acme"
    }, {
      id: "bar",
      name: "bar",
      displayName: "bar",
      versions: [{
        id: "baz1",
        name: "baz1",
        isDefault: false,
        specifications: []
      }, {
        id: "baz2",
        name: "baz2",
        isDefault: false,
        specifications: [{
          id: "hello1",
          name: "hello1.yml",
          url: "https://example.com/hello.yml"
        }, {
          id: "hello2",
          name: "hello2.yml",
          url: "https://example.com/hello.yml"
        }]
      }],
      owner: "acme",
      ownerUrl: "https://example.com/acme"
    }]
  })
  expect(sut.project!.owner).toEqual("acme")
  expect(sut.project!.name).toEqual("bar")
  expect(sut.version!.id).toEqual("baz2")
  expect(sut.specification!.id).toEqual("hello1")
})

test("It selects the specified project, version, and specification", () => {
  const sut = getProjectSelectionFromPath({
    path: "/acme/bar/baz2/hello2",
    projects: [{
      id: "foo",
      name: "foo",
      displayName: "foo",
      versions: [],
      owner: "acme",
      ownerUrl: "https://example.com/acme"
    }, {
      id: "bar",
      name: "bar",
      displayName: "bar",
      versions: [{
        id: "baz1",
        name: "baz1",
        isDefault: false,
        specifications: []
      }, {
        id: "baz2",
        name: "baz2",
        isDefault: false,
        specifications: [{
          id: "hello1",
          name: "hello1.yml",
          url: "https://example.com/hello.yml"
        }, {
          id: "hello2",
          name: "hello2.yml",
          url: "https://example.com/hello.yml"
        }]
      }],
      owner: "acme",
      ownerUrl: "https://example.com/acme"
    }]
  })
  expect(sut.project!.owner).toEqual("acme")
  expect(sut.project!.name).toEqual("bar")
  expect(sut.version!.id).toEqual("baz2")
  expect(sut.specification!.id).toEqual("hello2")
})

test("It returns a undefined project, version, and specification when the selected project cannot be found", () => {
  const sut = getProjectSelectionFromPath({
    path: "/acme/foo",
    projects: [{
      id: "bar",
      name: "bar",
      displayName: "bar",
      versions: [],
      owner: "acme",
      ownerUrl: "https://example.com/acme"
    }]
  })
  expect(sut.project).toBeUndefined()
  expect(sut.version).toBeUndefined()
  expect(sut.specification).toBeUndefined()
})

test("It returns a undefined version and specification when the selected version cannot be found", () => {
  const sut = getProjectSelectionFromPath({
    path: "/acme/foo/bar",
    projects: [{
      id: "foo",
      name: "foo",
      displayName: "foo",
      versions: [{
        id: "baz",
        name: "baz",
        isDefault: false,
        specifications: []
      }],
      owner: "acme",
      ownerUrl: "https://example.com/acme"
    }]
  })
  expect(sut.project!.owner).toEqual("acme")
  expect(sut.project!.name).toEqual("foo")
  expect(sut.version).toBeUndefined()
  expect(sut.specification).toBeUndefined()
})

test("It returns a undefined specification when the selected specification cannot be found", () => {
  const sut = getProjectSelectionFromPath({
    path: "/acme/foo/bar/baz",
    projects: [{
      id: "foo",
      name: "foo",
      displayName: "foo",
      versions: [{
        id: "bar",
        name: "bar",
        isDefault: false,
        specifications: [{
          id: "hello",
          name: "hello.yml",
          url: "https://example.com/hello.yml"
        }]
      }],
      owner: "acme",
      ownerUrl: "https://example.com/acme"
    }]
  })
  expect(sut.project!.owner).toEqual("acme")
  expect(sut.project!.name).toEqual("foo")
  expect(sut.version!.id).toEqual("bar")
  expect(sut.specification).toBeUndefined()
})

test("It moves specification ID to version ID if needed", () => {
  const sut = getProjectSelectionFromPath({
    path: "/acme/foo/bar/baz",
    projects: [{
      id: "foo",
      name: "foo",
      displayName: "foo",
      versions: [{
        id: "bar/baz",
        name: "bar",
        isDefault: false,
        specifications: [{
          id: "hello",
          name: "hello.yml",
          url: "https://example.com/hello.yml"
        }]
      }],
      owner: "acme",
      ownerUrl: "https://example.com/acme"
    }]
  })
  expect(sut.project!.owner).toEqual("acme")
  expect(sut.project!.name).toEqual("foo")
  expect(sut.version!.id).toEqual("bar/baz")
  expect(sut.specification!.id).toEqual("hello")
})

test("It supports specifications with spaces in their names", () => {
  const sut = getProjectSelectionFromPath({
    path: "/acme/foo/main/openapi with spaces.yml",
    projects: [
      {
        id: 'acme-foo',
        name: 'foo',
        displayName: "Ulrik's Playground",
        versions: [{
          id: 'main',
          name: 'main',
          specifications: [{
            id: "openapi with spaces.yml", 
            name: "openapi with spaces.yml", 
            url: "/api/blob/acme/foo-openapi/openapi with spaces.yml?ref=3dbafacbe57ac931ee750fc973bad3c81c9765bb", 
            editURL: "https://github.com/acme/foo-openapi/edit/main/openapi with spaces.yml"
          }],
          url: 'https://github.com/acme/foo-openapi/tree/main',
          isDefault: true
        }],
        imageURL: '/api/blob/acme/foo-openapi/icon.png?ref=3dbafacbe57ac931ee750fc973bad3c81c9765bb',
        url: 'https://github.com/acme/foo-openapi',
        owner: 'acme',
        ownerUrl: 'https://github.com/acme'
      }
    ]
  })
  expect(sut.project!.owner).toEqual("acme")
  expect(sut.project!.name).toEqual("foo")
  expect(sut.version!.id).toEqual("main")
  expect(sut.specification!.id).toEqual("openapi with spaces.yml")
})

test("It supports specifications with URL-encoded spaces in their names", () => {
  const sut = getProjectSelectionFromPath({
    path: "/acme/foo/main/openapi%20with%20spaces.yml",
    projects: [
      {
        id: 'acme-foo',
        name: 'foo',
        displayName: "Ulrik's Playground",
        versions: [{
          id: 'main',
          name: 'main',
          specifications: [{
            id: "openapi with spaces.yml", 
            name: "openapi with spaces.yml", 
            url: "/api/blob/acme/foo-openapi/openapi with spaces.yml?ref=3dbafacbe57ac931ee750fc973bad3c81c9765bb", 
            editURL: "https://github.com/acme/foo-openapi/edit/main/openapi with spaces.yml"
          }],
          url: 'https://github.com/acme/foo-openapi/tree/main',
          isDefault: true
        }],
        imageURL: '/api/blob/acme/foo-openapi/icon.png?ref=3dbafacbe57ac931ee750fc973bad3c81c9765bb',
        url: 'https://github.com/acme/foo-openapi',
        owner: 'acme',
        ownerUrl: 'https://github.com/acme'
      }
    ]
  })
  expect(sut.project!.owner).toEqual("acme")
  expect(sut.project!.name).toEqual("foo")
  expect(sut.version!.id).toEqual("main")
  expect(sut.specification!.id).toEqual("openapi with spaces.yml")
})

test("It selects a specification whose ID contains an URL-encoded slash", () => {
  const sut = getProjectSelectionFromPath({
    path: "/acme/polaris-monorepo/main/openapi%2Fopenapi-bundle.yml",
    projects: [{
      id: "polaris-monorepo",
      name: "polaris-monorepo",
      displayName: "Polaris (monorepo)",
      versions: [{
        id: "main",
        name: "main",
        isDefault: true,
        specifications: [{
          id: "openapi/openapi-bundle.yml",
          name: "Polaris API",
          url: "https://example.com/openapi-bundle.yml"
        }, {
          id: "openapi/datatjek-openapi.yml",
          name: "DataCheck",
          url: "https://example.com/datatjek-openapi.yml"
        }]
      }],
      owner: "acme",
      ownerUrl: "https://example.com/acme"
    }]
  })
  expect(sut.project!.name).toEqual("polaris-monorepo")
  expect(sut.version!.id).toEqual("main")
  expect(sut.specification!.id).toEqual("openapi/openapi-bundle.yml")
})

test("It still selects a specification in a version whose name contains a literal slash", () => {
  const sut = getProjectSelectionFromPath({
    path: "/acme/foo/feature/branch/hello.yml",
    projects: [{
      id: "foo",
      name: "foo",
      displayName: "foo",
      versions: [{
        id: "feature/branch",
        name: "feature/branch",
        isDefault: false,
        specifications: [{
          id: "hello.yml",
          name: "hello.yml",
          url: "https://example.com/hello.yml"
        }]
      }],
      owner: "acme",
      ownerUrl: "https://example.com/acme"
    }]
  })
  expect(sut.version!.id).toEqual("feature/branch")
  expect(sut.specification!.id).toEqual("hello.yml")
})
