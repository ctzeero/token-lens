class Tokenlens < Formula
  desc "Check token usage for Cursor and other AI providers"
  homepage "https://github.com/ctzeero/tokenlens"
  url "https://github.com/ctzeero/tokenlens/releases/download/1.0.1-beta/tokenlens"
  sha256 "9778c9673a7ff04779d13211966e7af69cb296a100f14120e2c11053e5ec393a"
  version "1.0.1-beta"

  def install
    bin.install "tokenlens" => "tlens"
  end

  test do
    system "#{bin}/tlens", "--help"
  end
end
