export default async (req) => {
  try {
    if (req.method !== "POST") {
      return json(
        {
          ok: false,
          error: "Método não permitido"
        },
        405
      );
    }

    const body = await req.json();

    // ============================
    // VALIDAÇÃO DO ID
    // ============================

    const pageId = String(
      body?.sale?.pageId || ""
    )
      .trim()
      .toUpperCase();

    if (!pageId) {
      return json(
        {
          ok: false,
          error: "ID da página não informado"
        },
        400
      );
    }

    if (!/^[A-Z0-9_-]{4,32}$/.test(pageId)) {
      return json(
        {
          ok: false,
          error: "Formato de ID inválido"
        },
        400
      );
    }

    // ============================
    // VARIÁVEIS DO NETLIFY
    // ============================

    const token =
      process.env.GITHUB_TOKEN;

    const owner =
      process.env.GITHUB_OWNER;

    const repo =
      process.env.GITHUB_REPO;

    const branch =
      process.env.GITHUB_BRANCH ||
      "main";

    if (!token) {
      throw new Error(
        "GITHUB_TOKEN não configurado"
      );
    }

    if (!owner) {
      throw new Error(
        "GITHUB_OWNER não configurado"
      );
    }

    if (!repo) {
      throw new Error(
        "GITHUB_REPO não configurado"
      );
    }

    // ============================
    // CAMINHO DO ARQUIVO
    // ============================

    const filePath =
      `data/pages/${pageId}.json`;

    const githubApi =
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

    // ============================
    // VERIFICAR SE JÁ EXISTE
    // ============================

    let sha = null;

    const checkResponse =
      await fetch(
        `${githubApi}?ref=${encodeURIComponent(branch)}`,
        {
          method: "GET",

          headers: {
            Authorization:
              `Bearer ${token}`,

            Accept:
              "application/vnd.github+json",

            "X-GitHub-Api-Version":
              "2022-11-28"
          }
        }
      );

    if (checkResponse.ok) {
      const existingFile =
        await checkResponse.json();

      sha =
        existingFile.sha;
    }

    // 404 = arquivo novo
    else if (
      checkResponse.status !== 404
    ) {
      const erroGithub =
        await checkResponse
          .json()
          .catch(() => ({}));

      throw new Error(
        erroGithub.message ||
        `Erro GitHub ${checkResponse.status}`
      );
    }

    // ============================
    // PREPARAR JSON
    // ============================

    const pageData = {
      ...body,

      meta: {
        ...(body.meta || {}),

        schema:
          body.meta?.schema || 1,

        updatedAt:
          new Date().toISOString(),

        published:
          true
      }
    };

    const conteudoJson =
      JSON.stringify(
        pageData,
        null,
        2
      );

    // GitHub Contents API exige Base64
    const contentBase64 =
      Buffer
        .from(
          conteudoJson,
          "utf8"
        )
        .toString(
          "base64"
        );

    // ============================
    // PAYLOAD PARA GITHUB
    // ============================

    const payload = {
      message:
        sha
          ? `Atualiza página ${pageId}`
          : `Cria página ${pageId}`,

      content:
        contentBase64,

      branch:
        branch
    };

    // Para atualizar arquivo existente,
    // o GitHub exige o SHA atual.
    if (sha) {
      payload.sha =
        sha;
    }

    // ============================
    // CRIAR / ATUALIZAR
    // ============================

    const saveResponse =
      await fetch(
        githubApi,
        {
          method: "PUT",

          headers: {
            Authorization:
              `Bearer ${token}`,

            Accept:
              "application/vnd.github+json",

            "X-GitHub-Api-Version":
              "2022-11-28",

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
      await saveResponse
        .json()
        .catch(() => ({}));

    if (!saveResponse.ok) {
      console.error(
        "ERRO GITHUB:",
        saveResult
      );

      return json(
        {
          ok: false,

          error:
            saveResult.message ||
            "GitHub recusou a alteração",

          githubStatus:
            saveResponse.status
        },
        saveResponse.status
      );
    }

    // ============================
    // SUCESSO
    // ============================

    return json(
      {
        ok: true,

        created:
          !sha,

        updated:
          !!sha,

        pageId:
          pageId,

        path:
          filePath,

        branch:
          branch,

        commitSha:
          saveResult
            ?.commit
            ?.sha || null,

        pageUrl:
          `/p/${pageId}/`
      },
      200
    );

  } catch (error) {

    console.error(
      "SAVE-PAGE ERROR:",
      error
    );

    return json(
      {
        ok: false,

        error:
          error?.message ||
          "Erro interno da função"
      },
      500
    );
  }
};


// ============================
// RESPOSTA JSON PADRÃO
// ============================

function json(
  data,
  status = 200
) {

  return new Response(
    JSON.stringify(data),
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
