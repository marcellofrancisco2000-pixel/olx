// netlify/functions/save-page.mjs
// Abravanel Admin — save-page com diagnóstico seguro.
// Nunca retorna o conteúdo do GITHUB_TOKEN.

const API_VERSION = "2022-11-28";

export default async (req) => {
  const requestId = crypto.randomUUID();

  try {
    // ============================================================
    // GET = HEALTH CHECK / SUPER DEBUG
    // ============================================================
    if (req.method === "GET") {
      const token = process.env.GITHUB_TOKEN || "";

// EDITE SOMENTE ESTAS DUAS LINHAS
const owner = "marcellofrancisco2000-pixel";
const repo = "olx";

const branch = "main";

      const missing = [];

      if (!token) {
        missing.push("GITHUB_TOKEN");
      }

      if (!owner) {
        missing.push("GITHUB_OWNER");
      }

      if (!repo) {
        missing.push("GITHUB_REPO");
      }

      const health = {
        ok: missing.length === 0,

        function: "save-page",

        requestId,

        time: new Date().toISOString(),

        env: {
          ok: missing.length === 0,

          missing,

          message: missing.length
            ? `Variáveis ausentes: ${missing.join(", ")}`
            : "Variáveis necessárias encontradas.",

          tokenPresent: Boolean(token),

          owner: owner || null,

          repo: repo || null,

          branch
        },

        github: {
          reachable: false,
          status: null,
          message: "Teste não executado"
        }
      };

      if (missing.length === 0) {
        try {
          const test = await fetch(
            `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
            {
              headers: githubHeaders(token)
            }
          );

          health.github.status = test.status;

          const body = await safeJson(test);

          if (test.ok) {
            health.github.reachable = true;

            health.github.message =
              `Repositório acessível: ${
                body.full_name ||
                owner + "/" + repo
              }`;

            health.github.defaultBranch =
              body.default_branch || null;

            health.github.private =
              body.private ?? null;
          } else {
            health.github.reachable = false;

            health.github.message =
              body.message ||
              `GitHub HTTP ${test.status}`;
          }
        } catch (error) {
          health.github.reachable = false;

          health.github.message =
            error.message;
        }
      }

      health.ok =
        health.env.ok &&
        health.github.reachable;

      return response(
        health,
        health.ok ? 200 : 500
      );
    }

    // ============================================================
    // POST = CRIAR / ATUALIZAR JSON DA PÁGINA
    // ============================================================

    if (req.method !== "POST") {
      return response(
        {
          ok: false,

          requestId,

          stage: "method",

          error:
            "Método não permitido"
        },
        405
      );
    }

    const body =
      await req.json();

    // ============================================================
    // ID DA PÁGINA
    // ============================================================

    const pageId = String(
      body?.sale?.pageId || ""
    )
      .trim()
      .toUpperCase();

    if (!pageId) {
      return response(
        {
          ok: false,

          requestId,

          stage: "validation",

          error:
            "ID da página não informado"
        },
        400
      );
    }

    if (
      !/^[A-Z0-9_-]{4,32}$/.test(
        pageId
      )
    ) {
      return response(
        {
          ok: false,

          requestId,

          stage: "validation",

          error:
            "Formato de ID inválido",

          pageId
        },
        400
      );
    }

    // ============================================================
    // VARIÁVEIS DO NETLIFY
    // ============================================================

    const token =
      process.env.GITHUB_TOKEN || "";

    const owner =
      process.env.GITHUB_OWNER || "";

    const repo =
      process.env.GITHUB_REPO || "";

    const branch =
      process.env.GITHUB_BRANCH ||
      "main";

    const missing = [];

    if (!token) {
      missing.push(
        "GITHUB_TOKEN"
      );
    }

    if (!owner) {
      missing.push(
        "GITHUB_OWNER"
      );
    }

    if (!repo) {
      missing.push(
        "GITHUB_REPO"
      );
    }

    if (missing.length) {
      return response(
        {
          ok: false,

          requestId,

          stage:
            "environment",

          error:
            `Variáveis ausentes: ${missing.join(", ")}`,

          env: {
            tokenPresent:
              Boolean(token),

            owner:
              owner || null,

            repo:
              repo || null,

            branch
          }
        },
        500
      );
    }

    // ============================================================
    // CAMINHO DO JSON
    // ============================================================

    const filePath =
      `data/pages/${pageId}.json`;

    const githubApi =
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath}`;

    // ============================================================
    // TESTAR O REPOSITÓRIO
    // ============================================================

    const repoTest =
      await fetch(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        {
          headers:
            githubHeaders(token)
        }
      );

    if (!repoTest.ok) {
      const repoError =
        await safeJson(
          repoTest
        );

      return response(
        {
          ok: false,

          requestId,

          stage:
            "github-repository",

          error:
            repoError.message ||
            `GitHub HTTP ${repoTest.status}`,

          githubStatus:
            repoTest.status,

          owner,

          repo,

          branch
        },
        repoTest.status === 404
          ? 502
          : repoTest.status
      );
    }

    // ============================================================
    // VERIFICAR SE O ARQUIVO JÁ EXISTE
    // ============================================================

    let sha = null;

    const checkResponse =
      await fetch(
        `${githubApi}?ref=${encodeURIComponent(branch)}`,
        {
          method: "GET",

          headers:
            githubHeaders(token)
        }
      );

    if (checkResponse.ok) {
      const existingFile =
        await safeJson(
          checkResponse
        );

      sha =
        existingFile.sha ||
        null;
    }

    else if (
      checkResponse.status !== 404
    ) {
      const checkError =
        await safeJson(
          checkResponse
        );

      return response(
        {
          ok: false,

          requestId,

          stage:
            "github-check-file",

          error:
            checkError.message ||
            `Erro ao verificar arquivo: HTTP ${checkResponse.status}`,

          githubStatus:
            checkResponse.status,

          filePath,

          branch
        },
        checkResponse.status
      );
    }

    // ============================================================
    // PREPARAR OS DADOS
    // ============================================================

    const pageData = {
      ...body,

      meta: {
        ...(body.meta || {}),

        schema:
          body.meta?.schema ||
          1,

        updatedAt:
          new Date()
            .toISOString(),

        published:
          true
      }
    };

    // Remove flag interna de debug
    delete pageData.__debug;

    const jsonText =
      JSON.stringify(
        pageData,
        null,
        2
      );

    const contentBase64 =
      Buffer
        .from(
          jsonText,
          "utf8"
        )
        .toString(
          "base64"
        );

    // ============================================================
    // PAYLOAD PARA GITHUB
    // ============================================================

    const payload = {
      message:
        sha
          ? `Atualiza página ${pageId}`
          : `Cria página ${pageId}`,

      content:
        contentBase64,

      branch
    };

    // Para atualizar arquivo existente,
    // o GitHub exige SHA.
    if (sha) {
      payload.sha =
        sha;
    }

    // ============================================================
    // CRIAR / ATUALIZAR ARQUIVO
    // ============================================================

    const saveResponse =
      await fetch(
        githubApi,
        {
          method: "PUT",

          headers: {
            ...githubHeaders(
              token
            ),

            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(
              payload
            )
        }
      );

    const saveResult =
      await safeJson(
        saveResponse
      );

    // ============================================================
    // ERRO DO GITHUB
    // ============================================================

    if (!saveResponse.ok) {
      return response(
        {
          ok: false,

          requestId,

          stage:
            "github-save",

          error:
            saveResult.message ||
            "GitHub recusou a alteração",

          githubStatus:
            saveResponse.status,

          documentation_url:
            saveResult.documentation_url ||
            null,

          filePath,

          branch,

          updatingExistingFile:
            Boolean(sha)
        },
        saveResponse.status
      );
    }

    // ============================================================
    // SUCESSO
    // ============================================================

    return response(
      {
        ok: true,

        requestId,

        stage:
          "complete",

        created:
          !sha,

        updated:
          Boolean(sha),

        pageId,

        path:
          filePath,

        owner,

        repo,

        branch,

        commitSha:
          saveResult
            ?.commit
            ?.sha ||
          null,

        pageUrl:
          `/p/${pageId}/`
      },
      200
    );

  } catch (error) {
    console.error(
      "SAVE-PAGE ERROR",
      requestId,
      error
    );

    return response(
      {
        ok: false,

        requestId,

        stage:
          "unhandled",

        error:
          error?.message ||
          "Erro interno da função",

        type:
          error?.name ||
          "Error"
      },
      500
    );
  }
};


// ============================================================
// HEADERS DO GITHUB
// ============================================================

function githubHeaders(
  token
) {
  return {
    Authorization:
      `Bearer ${token}`,

    Accept:
      "application/vnd.github+json",

    "X-GitHub-Api-Version":
      API_VERSION,

    "User-Agent":
      "Abravanel-Admin-Netlify-Function"
  };
}


// ============================================================
// LER RESPOSTA DO GITHUB
// ============================================================

async function safeJson(
  res
) {
  const text =
    await res.text();

  try {
    return JSON.parse(
      text
    );
  } catch {
    return {
      message:
        text ||
        `Resposta vazia (HTTP ${res.status})`
    };
  }
}


// ============================================================
// RESPOSTA JSON
// ============================================================

function response(
  data,
  status = 200
) {
  return new Response(
    JSON.stringify(
      data,
      null,
      2
    ),
    {
      status,

      headers: {
        "Content-Type":
          "application/json; charset=utf-8",

        "Cache-Control":
          "no-store"
      }
    }
  );
}
