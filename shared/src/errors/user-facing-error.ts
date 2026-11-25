/**
 * メッセージをそのままツールの呼び出し元に返してよい例外。
 * 呼び出し元が引数を直して呼び直せるように、何が悪いかを日本語で伝える文面だけを載せる。
 * これ以外の例外のメッセージは内部の事情を含みうるため、呼び出し元には返さない。
 */
export class UserFacingError extends Error {
  override readonly name = "UserFacingError";
}
