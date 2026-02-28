class Tokenlens < Formula
  desc "Check token usage for Cursor and other AI providers"
  homepage "https://github.com/ctzeero/tokenlens"
  url "https://github.com/ctzeero/tokenlens/releases/download/v0.1.0/tokenlens"
  sha256 "83fc9abb88ab22034d8b65d84882c10d70d4058b1931432377123b56fba4cf8b"
  version "0.1.0"

  def install
    bin.install "tokenlens" => "tlens"
  end

  test do
    system "#{bin}/tlens", "--help"
  end
end
