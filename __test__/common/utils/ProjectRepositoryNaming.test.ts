import { ProjectRepositoryNaming } from "@/common"

const createSut = (overrides: {
  repositoryNameSuffix?: string
  projectConfigurationFilename?: string
} = {}) => {
  return new ProjectRepositoryNaming({
    repositoryNameSuffix: overrides.repositoryNameSuffix ?? "-openapi",
    projectConfigurationFilename: overrides.projectConfigurationFilename ?? ".framna-docs.yml"
  })
}

test("It strips a .yml extension from the configuration filename", () => {
  const sut = createSut({ projectConfigurationFilename: ".framna-docs.yml" })
  expect(sut.configFileBaseName).toBe(".framna-docs")
})

test("It strips a .yaml extension from the configuration filename", () => {
  const sut = createSut({ projectConfigurationFilename: ".framna-docs.yaml" })
  expect(sut.configFileBaseName).toBe(".framna-docs")
})

test("It keeps a configuration filename without an extension as-is", () => {
  const sut = createSut({ projectConfigurationFilename: ".framna-docs" })
  expect(sut.configFileBaseName).toBe(".framna-docs")
})

test("It exposes both configuration file variants", () => {
  const sut = createSut()
  expect(sut.configFileYml).toBe(".framna-docs.yml")
  expect(sut.configFileYaml).toBe(".framna-docs.yaml")
  expect(sut.configFileVariants).toEqual([".framna-docs.yml", ".framna-docs.yaml"])
})

test("It detects the suffix", () => {
  const sut = createSut()
  expect(sut.hasSuffix("my-project-openapi")).toBe(true)
  expect(sut.hasSuffix("my-project")).toBe(false)
})

test("It appends the suffix only when missing", () => {
  const sut = createSut()
  expect(sut.suffixedName("my-project")).toBe("my-project-openapi")
  expect(sut.suffixedName("my-project-openapi")).toBe("my-project-openapi")
})

test("It strips the suffix from a repository name to get the project name", () => {
  const sut = createSut()
  expect(sut.projectName("my-project-openapi")).toBe("my-project")
})

test("It leaves a repository name without the suffix unchanged", () => {
  const sut = createSut()
  expect(sut.projectName("my-project")).toBe("my-project")
})

test("It only strips the suffix at the end of the name", () => {
  const sut = createSut()
  expect(sut.projectName("my-openapi-project")).toBe("my-openapi-project")
})

test("It treats regex characters in the suffix literally", () => {
  const sut = createSut({ repositoryNameSuffix: ".docs" })
  expect(sut.projectName("my-projectxdocs")).toBe("my-projectxdocs")
  expect(sut.projectName("my-project.docs")).toBe("my-project")
})
