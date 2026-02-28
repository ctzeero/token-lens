class Tokenlens < Formula
  desc "Check token usage for Cursor and other AI providers"
  homepage "https://github.com/ctzeero/tokenlens"
  url "https://github.com/ctzeero/tokenlens/releases/download/1.0.0-beta/tokenlens"
  sha256 "51074029369636b38ac3089e7cb8c03222df7b98de4173deb6b87e84bdf06bbd"
  version "1.0.0-beta"

  def install
    bin.install "tokenlens" => "tlens"
  end

  test do
    system "#{bin}/tlens", "--help"
  end
end
